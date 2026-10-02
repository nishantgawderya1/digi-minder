import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Camera,
  FileUp,
  Images,
  LoaderCircle,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PhoneShell } from "@/components/phone-shell";
import { DocumentPreview } from "@/components/document-preview";
import { requireCurrentUser } from "@/lib/route-auth";
import { prepareDocument, uploadDocument } from "@/lib/document-client";

export const Route = createFileRoute("/scan")({
  beforeLoad: () => requireCurrentUser(),
  head: () => ({ meta: [{ title: "Add a bill - Warrantly" }] }),
  component: ScanScreen,
});

export function ScanScreen() {
  const navigate = useNavigate();
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraPending, setCameraPending] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const cameraRequest = useRef(0);
  const mounted = useRef(true);
  const fileLock = useRef(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mounted.current = true;
    const generation = cameraRequest;
    return () => {
      mounted.current = false;
      generation.current++;
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    if (video.current && cameraActive) video.current.srcObject = stream.current;
  }, [cameraActive]);
  useEffect(() => {
    if (!selectedFile) return;
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const stopCamera = () => {
    cameraRequest.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCameraActive(false);
    setCameraReady(false);
    setCameraPending(false);
  };
  const startCamera = async () => {
    if (cameraPending || cameraActive || busy) return;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Camera access requires HTTPS or localhost. You can also choose a file.",
      );
      return;
    }
    const requestId = ++cameraRequest.current;
    setCameraPending(true);
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
      });
      if (!mounted.current || requestId !== cameraRequest.current) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = nextStream;
      setCameraActive(true);
    } catch (cause) {
      if (mounted.current && requestId === cameraRequest.current)
        setError(
          cause instanceof DOMException && cause.name === "NotAllowedError"
            ? "Camera access was blocked. Allow it in your browser's site settings or choose a file."
            : "The camera couldn't be opened. Close other camera apps or choose a file.",
        );
    } finally {
      if (mounted.current && requestId === cameraRequest.current)
        setCameraPending(false);
    }
  };
  const handleFile = async (file: File) => {
    if (fileLock.current) return;
    fileLock.current = true;
    stopCamera();
    setError(null);
    setBusy(true);
    setProgress("Preparing document");
    let prepared;
    try {
      prepared = await prepareDocument(file);
      setSelectedFile(prepared.file);
      const result = await uploadDocument(prepared, (message) => {
        if (mounted.current) setProgress(message);
      });
      if (mounted.current)
        await navigate({
          to: "/review/$documentId",
          params: { documentId: result.id },
        });
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "This file couldn't be uploaded. Please retry.",
        );
    } finally {
      prepared?.dispose();
      fileLock.current = false;
      if (mounted.current) {
        setBusy(false);
        setProgress("");
      }
    }
  };
  const takePhoto = async () => {
    if (!video.current?.videoWidth || !cameraReady || busy) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth;
    canvas.height = video.current.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("The photo couldn't be captured. Please try again.");
      return;
    }
    context.drawImage(video.current, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.94),
    );
    canvas.width = 0;
    canvas.height = 0;
    if (blob && mounted.current)
      await handleFile(
        new File([blob], `bill-${Date.now()}.jpg`, { type: "image/jpeg" }),
      );
    else if (mounted.current)
      setError("The photo couldn't be captured. Please try again.");
  };

  return (
    <PhoneShell>
      <header className="flex items-center gap-3 border-b border-border px-5 py-4 lg:px-8">
        <Link
          to="/home"
          title="Back to Today"
          aria-label="Back to Today"
          className="grid h-9 w-9 place-items-center rounded-sm border border-border"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-base font-extrabold">Add a bill</h1>
      </header>
      <div className="grid min-w-0 gap-6 px-5 pt-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:px-8">
        {busy && selectedFile ? (
          <DocumentPreview
            url={previewUrl}
            filename={selectedFile.name}
            contentType={selectedFile.type}
          />
        ) : (
          <div className="relative aspect-[3/4] overflow-hidden rounded-sm border border-foreground bg-foreground">
            {cameraActive ? (
              <video
                ref={video}
                autoPlay
                playsInline
                muted
                onCanPlay={() => setCameraReady(true)}
                className="absolute inset-0 h-full w-full object-contain"
                aria-label="Live camera preview"
              />
            ) : (
              <div className="hatch absolute inset-0 opacity-30" />
            )}
            <div className="pointer-events-none absolute inset-6 border-2 border-dashed border-background/50" />
            <p className="absolute inset-x-0 bottom-4 px-6 text-center text-xs font-semibold text-background">
              {cameraActive
                ? "Fit the full bill in the frame"
                : "Ready for your next receipt"}
            </p>
            {cameraActive || cameraPending ? (
              <button
                onClick={stopCamera}
                title="Close camera"
                aria-label="Close camera"
                className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-sm bg-background text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        )}
        <div className="min-w-0 space-y-5 lg:pt-2">
          <div>
            <h2 className="text-xl font-extrabold">
              Keep the original. Check every detail.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Bills, invoices and warranty cards.
            </p>
          </div>
          <input
            ref={imageInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose a bill image"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleFile(file);
            }}
          />
          <input
            ref={documentInput}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            aria-label="Choose a bill document"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleFile(file);
            }}
          />
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
            <button
              onClick={cameraActive ? takePhoto : startCamera}
              disabled={busy || cameraPending || (cameraActive && !cameraReady)}
              className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-sm bg-primary px-2 py-3 text-primary-foreground shadow-[0_4px_0_0_var(--color-foreground)] disabled:opacity-50 lg:flex-row"
            >
              {cameraPending ? (
                <LoaderCircle className="h-5 w-5 animate-spin" />
              ) : (
                <Camera className="h-5 w-5" />
              )}
              <span className="text-xs font-bold">
                {cameraPending
                  ? "Opening..."
                  : cameraActive
                    ? "Take photo"
                    : "Camera"}
              </span>
            </button>
            <button
              onClick={() => imageInput.current?.click()}
              disabled={busy}
              className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-sm border border-border bg-card px-2 py-3 disabled:opacity-50 lg:flex-row"
            >
              <Images className="h-5 w-5" />
              <span className="text-xs font-bold">Image</span>
            </button>
            <button
              onClick={() => documentInput.current?.click()}
              disabled={busy}
              className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-sm border border-border bg-card px-2 py-3 disabled:opacity-50 lg:flex-row"
            >
              <FileUp className="h-5 w-5" />
              <span className="text-xs font-bold">Document</span>
            </button>
          </div>
          <button
            disabled={busy}
            onClick={() => documentInput.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file && !busy) void handleFile(file);
            }}
            className="hidden min-h-28 w-full flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground lg:flex"
          >
            <FileUp className="h-6 w-6" />
            Drop a file here
          </button>
          <p className="text-xs text-muted-foreground">
            JPG, PNG, WebP or PDF · Up to 15 MB and 10 pages
          </p>
          {busy ? (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-3 border-y border-border py-4 text-sm font-semibold"
            >
              <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-primary" />
              {progress}
            </div>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-sm border border-destructive/40 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </PhoneShell>
  );
}
