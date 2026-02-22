import { useState, useEffect, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { RefreshCcw, QrCode, Smartphone, Plug, AlertCircle, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const QR_REFRESH_INTERVAL = 15_000; // Refresh QR every 15s (WhatsApp QR expires in ~20s)
const STATUS_POLL_INTERVAL = 3_000; // Poll connection state every 3s after QR is shown

export function EvoQRConnector() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState("");
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [instanceInfo, setInstanceInfo] = useState<string | null>(null);

    const qrRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const statusPollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const isMounted = useRef(true);

    const API_URL = import.meta.env.VITE_EVO_API_URL;
    const API_KEY = import.meta.env.VITE_EVO_API_KEY;
    const BOT_NAME = import.meta.env.VITE_EVO_BOT_NAME || "busybot";
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/webhook`;

    const getBaseUrl = () => {
        const url = API_URL || "";
        return url.endsWith("/") ? url.slice(0, -1) : url;
    };

    const getHeaders = (): Record<string, string> => ({
        "Content-Type": "application/json",
        "apikey": API_KEY,
    });

    // Register webhook with Evolution API so incoming messages are forwarded to our edge function
    const registerWebhook = useCallback(async () => {
        try {
            const baseUrl = getBaseUrl();
            const res = await fetch(`${baseUrl}/webhook/set/${BOT_NAME}`, {
                method: "POST",
                headers: getHeaders(),
                body: JSON.stringify({
                    webhook: {
                        enabled: true,
                        url: WEBHOOK_URL,
                        webhookByEvents: false,
                        webhookBase64: false,
                        events: [
                            "MESSAGES_UPSERT",
                            "CONNECTION_UPDATE",
                        ],
                    },
                }),
            });
            if (res.ok) {
                console.log("Webhook registered successfully at", WEBHOOK_URL);
            } else {
                const errText = await res.text();
                console.error("Failed to register webhook:", res.status, errText);
            }
        } catch (err) {
            console.error("Error registering webhook:", err);
        }
    }, [API_URL, API_KEY, BOT_NAME, WEBHOOK_URL]);

    const handleDeleteInstances = async () => {
        setLoading(true);
        try {
            const baseUrl = getBaseUrl();
            const headers = getHeaders();

            const instancesToDelete = [BOT_NAME, "prevoiusinstance", "previousinstance"];

            for (const instance of instancesToDelete) {
                try {
                    await fetch(`${baseUrl}/instance/delete/${instance}`, {
                        method: "DELETE",
                        headers,
                    });
                    await fetch(`${baseUrl}/instance/logout/${instance}`, {
                        method: "DELETE",
                        headers,
                    });
                } catch (e) {
                    console.error(`Failed to delete/logout instance ${instance}`, e);
                }
            }

            toast({
                title: "Instances Deleted",
                description: "Current and previous instances were deleted successfully.",
            });

            stopPolling();
            setStatus("idle");
            setQrCode(null);
        } catch (error) {
            console.error("Error deleting instances:", error);
            toast({
                title: "Error",
                description: "Failed to delete instances.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    // Stop all polling timers
    const stopPolling = useCallback(() => {
        if (qrRefreshTimer.current) {
            clearInterval(qrRefreshTimer.current);
            qrRefreshTimer.current = null;
        }
        if (statusPollTimer.current) {
            clearInterval(statusPollTimer.current);
            statusPollTimer.current = null;
        }
    }, []);

    // Poll the connection state to detect when the phone successfully links
    const checkConnectionState = useCallback(async (): Promise<boolean> => {
        try {
            const res = await fetch(`${getBaseUrl()}/instance/connectionState/${BOT_NAME}`, {
                method: "GET",
                headers: getHeaders(),
            });
            if (res.ok) {
                const data = await res.json();
                if (data?.instance?.state === "open") {
                    return true;
                }
            }
        } catch {
            // Silently ignore polling errors
        }
        return false;
    }, [API_URL, API_KEY, BOT_NAME]);

    // Start polling connection state after a QR code is displayed
    const startStatusPolling = useCallback(() => {
        if (statusPollTimer.current) clearInterval(statusPollTimer.current);

        statusPollTimer.current = setInterval(async () => {
            const connected = await checkConnectionState();
            if (connected && isMounted.current) {
                stopPolling();
                setQrCode(null);
                setStatus("connected");
                // Register webhook so incoming messages are forwarded to our backend
                await registerWebhook();
                toast({
                    title: "Device Linked!",
                    description: "WhatsApp is now connected to BusyBot.",
                });
            }
        }, STATUS_POLL_INTERVAL);
    }, [checkConnectionState, stopPolling, toast]);

    // Fetch a fresh QR code from the connect endpoint
    const fetchNewQR = useCallback(async () => {
        const baseUrl = getBaseUrl();
        const headers = getHeaders();

        const connectRes = await fetch(`${baseUrl}/instance/connect/${BOT_NAME}`, {
            method: "GET",
            headers,
        });

        if (!connectRes.ok) {
            const errBody = await connectRes.text();
            throw new Error(`Failed to connect: ${connectRes.status} ${errBody}`);
        }

        const data = await connectRes.json();
        console.log("Evolution API connect response:", data);

        // Evolution API v2 returns { code, pairingCode, count }
        // "code" is the QR code data string for WhatsApp Web linking
        const qr = data?.code || data?.base64 || data?.qrcode;
        if (!qr) {
            throw new Error("QR code not found in response.");
        }
        return qr as string;
    }, [API_URL, API_KEY, BOT_NAME]);

    const fetchQR = async () => {
        if (!API_URL || !API_KEY) {
            toast({
                title: "Configuration Error",
                description: "API URL or Key is missing from environment variables.",
                variant: "destructive",
            });
            return;
        }

        stopPolling();
        setLoading(true);
        setStatus("connecting");
        setErrorMessage(null);
        setQrCode(null);
        setInstanceInfo(null);

        const baseUrl = getBaseUrl();
        const headers = getHeaders();

        try {
            // ─── STEP 1: Check if instance exists on Render ───
            setLoadingStep("Checking Evolution API server...");
            let instanceExists = false;
            let instanceState = "unknown";

            try {
                const statusRes = await fetch(`${baseUrl}/instance/connectionState/${BOT_NAME}`, {
                    method: "GET",
                    headers,
                });

                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    instanceState = statusData?.instance?.state || "unknown";
                    instanceExists = true;
                    console.log(`Instance "${BOT_NAME}" found — state: ${instanceState}`);
                    setInstanceInfo(`Instance "${BOT_NAME}" found (${instanceState})`);

                    // Already connected!
                    if (instanceState === "open") {
                        setLoadingStep("Already connected!");
                        setStatus("connected");
                        setLoading(false);
                        await registerWebhook();
                        toast({ title: "Already Connected", description: `Instance "${BOT_NAME}" is already linked to WhatsApp.` });
                        return;
                    }
                } else if (statusRes.status === 404) {
                    instanceExists = false;
                    console.log(`Instance "${BOT_NAME}" not found (404)`);
                    setInstanceInfo(`Instance "${BOT_NAME}" not found`);
                } else {
                    // Other error — might be Render cold start, try to continue
                    const errText = await statusRes.text();
                    console.warn(`Connection state check returned ${statusRes.status}:`, errText);
                    setInstanceInfo(`Server returned ${statusRes.status} — will try to create instance`);
                    instanceExists = false;
                }
            } catch (fetchErr) {
                // Network error — Render might be sleeping/cold starting
                console.warn("Could not reach Evolution API — server may be starting up:", fetchErr);
                setInstanceInfo("Server may be starting up (Render cold start)...");
                setLoadingStep("Waiting for server to wake up...");
                // Wait 5s and retry once
                await new Promise(r => setTimeout(r, 5000));
                try {
                    const retryRes = await fetch(`${baseUrl}/instance/connectionState/${BOT_NAME}`, {
                        method: "GET",
                        headers,
                    });
                    if (retryRes.ok) {
                        const retryData = await retryRes.json();
                        instanceState = retryData?.instance?.state || "unknown";
                        instanceExists = true;
                        setInstanceInfo(`Instance "${BOT_NAME}" found (${instanceState})`);
                        if (instanceState === "open") {
                            setStatus("connected");
                            setLoading(false);
                            await registerWebhook();
                            return;
                        }
                    } else if (retryRes.status === 404) {
                        instanceExists = false;
                        setInstanceInfo(`Instance "${BOT_NAME}" not found`);
                    } else {
                        instanceExists = false;
                    }
                } catch {
                    throw new Error("Cannot reach Evolution API server. Check if your Render service is running at: " + baseUrl);
                }
            }

            // ─── STEP 2: Create instance if it doesn't exist ───
            if (!instanceExists) {
                setLoadingStep(`Creating instance "${BOT_NAME}"...`);
                console.log(`Creating new instance: ${BOT_NAME}`);

                const createRes = await fetch(`${baseUrl}/instance/create`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        instanceName: BOT_NAME,
                        integration: "WHATSAPP-BAILEYS",
                        token: API_KEY,
                        qrcode: true,
                        groupsIgnore: true,
                        readMessages: true,
                        alwaysOnline: true,
                        webhook: {
                            url: WEBHOOK_URL,
                            enabled: true,
                            webhookByEvents: false,
                            webhookBase64: false,
                            events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
                        },
                    }),
                });

                if (!createRes.ok) {
                    const errBody = await createRes.text();
                    // If "already exists", that's fine — just continue to connect
                    if (errBody.toLowerCase().includes("already") || errBody.toLowerCase().includes("exists")) {
                        console.log("Instance already exists, proceeding to connect...");
                        setInstanceInfo(`Instance "${BOT_NAME}" already exists`);
                    } else {
                        throw new Error(`Failed to create instance: ${createRes.status} — ${errBody.substring(0, 200)}`);
                    }
                } else {
                    const createData = await createRes.json();
                    console.log("Instance created:", createData);
                    setInstanceInfo(`Instance "${BOT_NAME}" created successfully`);

                    // If create already returned a QR code, use it immediately
                    const immediateQR = createData?.qrcode?.code || createData?.qrcode?.base64 || createData?.code;
                    if (immediateQR) {
                        setQrCode(immediateQR);
                        setStatus("idle");
                        setLoading(false);
                        setLoadingStep("");
                        startStatusPolling();
                        qrRefreshTimer.current = setInterval(async () => {
                            try {
                                const newQR = await fetchNewQR();
                                if (isMounted.current) setQrCode(newQR);
                            } catch (err) {
                                console.warn("QR auto-refresh failed:", err);
                            }
                        }, QR_REFRESH_INTERVAL);
                        return;
                    }
                }
            } else {
                setInstanceInfo(`Instance "${BOT_NAME}" exists — connecting...`);
            }

            // ─── STEP 3: Fetch QR code to link WhatsApp ───
            setLoadingStep("Fetching QR code...");
            const qr = await fetchNewQR();
            setQrCode(qr);
            setStatus("idle");
            setLoadingStep("");

            // Auto-refresh QR every 15s
            qrRefreshTimer.current = setInterval(async () => {
                try {
                    const newQR = await fetchNewQR();
                    if (isMounted.current) setQrCode(newQR);
                } catch (err) {
                    console.warn("QR auto-refresh failed:", err);
                }
            }, QR_REFRESH_INTERVAL);

            // Poll for successful connection
            startStatusPolling();

        } catch (error) {
            console.error("QR Fetch Error:", error);
            setStatus("error");
            setErrorMessage(error instanceof Error ? error.message : "Failed to fetch QR code");
            setLoadingStep("");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        isMounted.current = true;
        fetchQR();
        return () => {
            isMounted.current = false;
            stopPolling();
        };
    }, []);

    return (
        <div className="glass rounded-xl p-6 relative overflow-hidden group">
            {/* Decorative background gradients */}
            <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/10 blur-3xl transition-all duration-500 group-hover:bg-primary/20" />
            <div className="absolute -left-20 -bottom-20 h-40 w-40 rounded-full bg-chart-4/10 blur-3xl transition-all duration-500 group-hover:bg-chart-4/20" />

            <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg transition-colors ${status === 'connected' ? 'bg-green-500/10' : 'bg-primary/10'}`}>
                            <Smartphone className={`h-5 w-5 ${status === 'connected' ? 'text-green-500' : 'text-primary'}`} />
                        </div>
                        <div>
                            <h3 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
                                WhatsApp Connection
                                {status === "connected" && (
                                    <span className="flex h-2 w-2 relative">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                    </span>
                                )}
                            </h3>
                            <p className="text-xs text-muted-foreground">Link your device to enable auto-replies</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full border ${status === "connected" ? "bg-green-500/10 text-green-500 border-green-500/20" :
                            status === "error" ? "bg-destructive/10 text-destructive border-destructive/20" :
                                "bg-secondary text-muted-foreground border-border"
                            }`}>
                            {status === "connected" ? "Connected" : status === "error" ? "Error" : "Disconnected"}
                        </span>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-8 items-center justify-between p-4 rounded-xl bg-secondary/30 border border-border/50">

                    <div className="flex-1 space-y-4">
                        {status === "connected" ? (
                            <div className="space-y-2">
                                <h4 className="text-sm font-medium text-foreground">Device Linked Successfully</h4>
                                <p className="text-sm text-muted-foreground">BusyBot is now able to read and respond to your messages automatically according to your rules.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <h4 className="text-sm font-medium text-foreground">How to connect:</h4>
                                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside ml-1">
                                    <li>Open WhatsApp on your phone</li>
                                    <li>Tap Menu <span className="text-foreground">⋮</span> or Settings ⚙️</li>
                                    <li>Tap <span className="text-foreground font-medium">Linked Devices</span></li>
                                    <li>Tap <span className="text-foreground font-medium">Link a Device</span></li>
                                    <li>Point your phone to this screen to capture the code</li>
                                </ol>

                                {instanceInfo && (
                                    <div className="mt-3 flex items-start gap-2 text-blue-600 dark:text-blue-400 bg-blue-500/10 p-3 rounded-lg border border-blue-500/20">
                                        <Smartphone className="h-4 w-4 shrink-0 mt-0.5" />
                                        <p className="text-xs font-medium">{instanceInfo}</p>
                                    </div>
                                )}

                                {errorMessage && (
                                    <div className="mt-3 flex items-start gap-2 text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20">
                                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                        <p className="text-xs">{errorMessage}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3 mt-4">
                            <Button
                                onClick={fetchQR}
                                disabled={loading || status === "connected"}
                                variant={status === "error" ? "destructive" : "outline"}
                                className={`w-full flex-1 transition-all ${loading ? 'opacity-70' : ''}`}
                            >
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <RefreshCcw className="h-4 w-4 animate-spin" />
                                        {loadingStep || "Connecting..."}
                                    </span>
                                ) : status === "connected" ? (
                                    <span className="flex items-center gap-2">
                                        <Plug className="h-4 w-4" />
                                        Reconnect Device
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <QrCode className="h-4 w-4" />
                                        {qrCode ? "Refresh QR Code" : "Generate Local QR"}
                                    </span>
                                )}
                            </Button>

                            <Button
                                onClick={handleDeleteInstances}
                                disabled={loading}
                                variant="destructive"
                                className={`w-full flex-1 transition-all ${loading ? 'opacity-70' : ''}`}
                                title="Delete current and previous instances"
                            >
                                <span className="flex items-center gap-2">
                                    <Trash2 className="h-4 w-4" />
                                    Delete Instances
                                </span>
                            </Button>
                        </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-center justify-center p-4 rounded-xl bg-white aspect-square w-48 border-2 border-primary/20 shadow-[0_0_30px_rgba(75,81,255,0.1)] relative">
                        {status === "connected" ? (
                            <div className="text-center space-y-3 px-4">
                                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/20">
                                    <Smartphone className="h-8 w-8 text-green-600 dark:text-green-400" />
                                </div>
                                <p className="text-sm font-medium text-slate-900">Ready</p>
                            </div>
                        ) : loading ? (
                            <div className="flex flex-col items-center justify-center space-y-4">
                                <div className="relative">
                                    <div className="absolute inset-0 border-4 border-primary/20 rounded-lg rounded-tl-none -m-2 opacity-50"></div>
                                    <div className="absolute inset-0 border-4 border-primary/20 rounded-lg rounded-tr-none -m-2 opacity-50"></div>
                                    <div className="absolute inset-0 border-4 border-primary/20 rounded-lg rounded-bl-none -m-2 opacity-50"></div>
                                    <div className="absolute inset-0 border-4 border-primary/20 rounded-lg rounded-br-none -m-2 opacity-50"></div>
                                    <RefreshCcw className="h-8 w-8 text-primary animate-spin" />
                                </div>
                                <span className="text-xs font-medium text-slate-500 animate-pulse text-center px-2 leading-relaxed">{loadingStep || "Connecting..."}</span>
                            </div>
                        ) : qrCode ? (
                            // If it's a base64 image, render as <img>. Otherwise render as QR code from data string.
                            qrCode.startsWith("data:image") ? (
                                <img src={qrCode} alt="WhatsApp QR Code" className="w-full h-full object-contain mix-blend-multiply" />
                            ) : qrCode.length > 500 ? (
                                // Long base64 string without prefix — treat as base64 PNG
                                <img src={`data:image/png;base64,${qrCode}`} alt="WhatsApp QR Code" className="w-full h-full object-contain mix-blend-multiply" />
                            ) : (
                                <QRCodeSVG value={qrCode} size={150} level="M" />
                            )
                        ) : (
                            <div className="text-center text-slate-400 space-y-2 px-2">
                                <QrCode className="h-10 w-10 mx-auto opacity-50" />
                                <p className="text-xs">Click generate to view code</p>
                            </div>
                        )}

                        {/* Elegant overlay scan line animation when code is visible */}
                        {qrCode && !loading && status !== "connected" && (
                            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/10 to-transparent h-1 w-full animate-scan"></div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
