import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Camera,
  FileUp,
  ScanLine,
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
  const [capturing, setCapturing] = useState(false);
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
  const captureLock = useRef(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const errorMessage = useRef<HTMLParagraphElement>(null);
  const progressMessage = useRef<HTMLDivElement>(null);

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
    if (video.current && cameraActive) {
      const generation = cameraRequest.current;
      video.current.srcObject = stream.current;
      void video.current.play().catch(() => {
        if (mounted.current && generation === cameraRequest.current)
          setError(
            "The camera preview couldn't play. Reopen the camera or choose a file.",
          );
      });
    }
  }, [cameraActive]);
  useEffect(() => {
    if (!selectedFile) return;
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);
  useEffect(() => {
    if (error) errorMessage.current?.scrollIntoView({ block: "center" });
  }, [error]);
  useEffect(() => {
    if (busy) progressMessage.current?.scrollIntoView({ block: "center" });
  }, [busy, progress, selectedFile, previewUrl]);

  const stopCamera = () => {
    cameraRequest.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCameraActive(false);
    setCameraReady(false);
    setCameraPending(false);
  };
  const startCamera = async () => {
    if (cameraPending || cameraActive || busy || captureLock.current) return;
    setError(null);
    setSelectedFile(null);
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
    if (
      !video.current?.videoWidth ||
      !cameraReady ||
      busy ||
      captureLock.current
    )
      return;
    captureLock.current = true;
    setCapturing(true);
    const generation = cameraRequest.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth;
    canvas.height = video.current.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("The photo couldn't be captured. Please try again.");
      captureLock.current = false;
      setCapturing(false);
      return;
    }
    try {
      context.drawImage(video.current, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.94),
      );
      if (!mounted.current || generation !== cameraRequest.current) return;
      if (!blob)
        throw new Error("The photo couldn't be captured. Please try again.");
      await handleFile(
        new File([blob], `bill-${Date.now()}.jpg`, { type: "image/jpeg" }),
      );
    } catch {
      if (mounted.current)
        setError("The photo couldn't be captured. Please try again.");
    } finally {
      canvas.width = 0;
      canvas.height = 0;
      captureLock.current = false;
      if (mounted.current) setCapturing(false);
    }
  };

  return (
    <PhoneShell showMobileTabs={false}>
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
      <div className="grid min-w-0 gap-5 px-5 pt-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:px-8">
        {selectedFile && !cameraActive ? (
          <DocumentPreview
            url={previewUrl}
            filename={selectedFile.name}
            contentType={selectedFile.type}
          />
        ) : (
          <div
            className={`relative overflow-hidden rounded-sm border border-foreground bg-foreground ${cameraActive ? "h-[min(58svh,calc(100svh-208px))] min-h-32" : "h-[min(48svh,420px)] min-h-52"} lg:h-[520px]`}
          >
            {cameraActive ? (
              <video
                ref={video}
                autoPlay
                playsInline
                muted
                onCanPlay={() => setCameraReady(true)}
                className="absolute inset-x-0 top-0 h-[calc(100%-96px)] w-full object-contain"
                aria-label="Live camera preview"
              />
            ) : (
              <div className="absolute inset-0 grid place-content-center gap-3 text-center text-background/70">
                <ScanLine className="mx-auto h-12 w-12" strokeWidth={1.5} />
                <p className="text-sm font-semibold">No bill selected</p>
              </div>
            )}
            <div
              className={`pointer-events-none absolute inset-x-6 top-6 border-2 border-dashed border-background/50 ${cameraActive ? "bottom-28" : "bottom-6"}`}
            />
            {cameraActive ? (
              <div className="absolute inset-x-0 bottom-0 flex justify-center bg-foreground/70 py-4">
                <button
                  type="button"
                  aria-label="Take photo"
                  title="Take photo"
                  onClick={() => void takePhoto()}
                  disabled={!cameraReady || capturing || busy}
                  className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-4 border-background bg-primary text-primary-foreground outline-offset-4 focus-visible:outline-2 focus-visible:outline-background disabled:opacity-50"
                >
                  {capturing ? (
                    <LoaderCircle className="h-6 w-6 animate-spin" />
                  ) : (
                    <Camera className="h-7 w-7" />
                  )}
                </button>
              </div>
            ) : null}
            {cameraActive || cameraPending ? (
              <button
                onClick={stopCamera}
                disabled={busy}
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
          <h2 className="hidden text-lg font-bold lg:block">
            Bill, invoice or warranty card
          </h2>
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
          <div
            role="group"
            aria-label="Bill upload options"
            className="fixed bottom-0 left-1/2 z-30 grid w-full max-w-[760px] -translate-x-1/2 grid-cols-3 gap-2 border-t border-border bg-background px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] lg:static lg:max-w-none lg:translate-x-0 lg:grid-cols-1 lg:border-0 lg:bg-transparent lg:p-0"
          >
            <button
              onClick={cameraActive ? stopCamera : startCamera}
              aria-pressed={cameraActive}
              disabled={busy || cameraPending || capturing}
              className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-sm bg-primary px-2 py-2 text-primary-foreground disabled:opacity-50 lg:flex-row lg:gap-2"
            >
              {cameraPending ? (
                <LoaderCircle className="h-5 w-5 animate-spin" />
              ) : (
                <Camera className="h-5 w-5" />
              )}
              <span className="text-xs font-bold">
                {cameraPending ? "Opening..." : "Camera"}
              </span>
            </button>
            <button
              onClick={() => imageInput.current?.click()}
              disabled={busy || capturing}
              className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-sm border border-border bg-card px-2 py-2 disabled:opacity-50 lg:flex-row lg:gap-2"
            >
              <Images className="h-5 w-5" />
              <span className="text-xs font-bold">Image</span>
            </button>
            <button
              onClick={() => documentInput.current?.click()}
              disabled={busy || capturing}
              className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-sm border border-border bg-card px-2 py-2 disabled:opacity-50 lg:flex-row lg:gap-2"
            >
              <FileUp className="h-5 w-5" />
              <span className="text-xs font-bold">Document</span>
            </button>
          </div>
          <button
            disabled={busy || capturing}
            onClick={() => documentInput.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file && !busy && !capturing) void handleFile(file);
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
              ref={progressMessage}
              role="status"
              aria-live="polite"
              className="scroll-mb-32 flex items-center gap-3 border-y border-border py-4 text-sm font-semibold"
            >
              <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-primary" />
              {progress}
            </div>
          ) : null}
          {error ? (
            <p
              ref={errorMessage}
              role="alert"
              className="scroll-mb-32 rounded-sm border border-destructive/40 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </PhoneShell>
  );
}
