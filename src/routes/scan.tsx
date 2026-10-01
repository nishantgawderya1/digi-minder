import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Camera,
  Check,
  FileText,
  FileUp,
  Images,
  Pencil,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PhoneShell } from "@/components/phone-shell";
import { requireCurrentUser } from "@/lib/route-auth";

export const Route = createFileRoute("/scan")({
  beforeLoad: () => requireCurrentUser(),
  head: () => ({
    meta: [
      { title: "Scan a bill — Warrantly" },
      {
        name: "description",
        content:
          "Capture a bill or warranty card and check the details we read from it.",
      },
      { property: "og:title", content: "Scan a bill — Warrantly" },
      {
        property: "og:description",
        content:
          "Capture a bill or warranty card and check the details we read from it.",
      },
    ],
  }),
  component: ScanScreen,
});

const readFields = [
  ["Item", "FrontLoad 7kg Washing Machine"],
  ["Brand", "Bosch"],
  ["Purchase date", "12 Apr 2026"],
  ["Amount", "₹34,990"],
  ["Serial / model", "BSH-WM-7741-2026"],
  ["Warranty", "6 months · till 12 Oct 2026"],
  ["Seller", "Croma, Andheri West"],
];

function ScanScreen() {
  const [step, setStep] = useState<"capture" | "reading" | "review">("capture");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  useEffect(
    () => () => cameraStream?.getTracks().forEach((track) => track.stop()),
    [cameraStream],
  );

  const stopCamera = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
  };

  const startCamera = async () => {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Camera access is unavailable. Choose an image to continue.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      setCameraStream(stream);
    } catch (error) {
      setCameraError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera permission was blocked. Allow camera access in your browser settings, or choose an image instead."
          : "Could not open the camera. Choose an image instead.",
      );
    }
  };

  const beginReview = (file: File) => {
    setSelectedFile(file);
    setCameraError("");
    stopCamera();
    setStep("reading");
    window.setTimeout(() => setStep("review"), 900);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          beginReview(
            new File([blob], `bill-${Date.now()}.jpg`, { type: "image/jpeg" }),
          );
        }
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <PhoneShell>
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-border px-5 py-4">
        <Link
          to="/home"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-border"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="min-w-0 truncate text-base font-extrabold">
          {step === "review" ? "Check the details" : "Add a document"}
        </h1>
      </header>

      {step !== "review" ? (
        <div className="grid gap-5 px-5 pt-5 lg:grid-cols-[minmax(300px,460px)_minmax(0,1fr)] lg:items-start lg:px-8">
          <div className="relative aspect-[3/4] overflow-hidden rounded-sm border border-foreground bg-foreground lg:min-h-[560px]">
            {cameraStream ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-cover"
                aria-label="Live camera preview"
              />
            ) : (
              <div className="hatch absolute inset-0 opacity-30" />
            )}
            <div className="pointer-events-none absolute inset-6 rounded-sm border-2 border-dashed border-background/50" />
            <div className="absolute inset-x-0 bottom-0 p-4 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-background/70">
                {step === "reading"
                  ? "Reading with Nemotron OCR..."
                  : cameraStream
                    ? "Fit the bill in the frame"
                    : "Open camera or choose a file"}
              </p>
            </div>
            {step === "reading" ? (
              <div className="absolute inset-x-6 top-1/3 h-0.5 animate-pulse bg-accent" />
            ) : null}
          </div>

          <div className="lg:sticky lg:top-6 lg:pt-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) beginReview(file);
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={documentInputRef}
              type="file"
              accept="application/pdf,.pdf,image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) beginReview(file);
                event.currentTarget.value = "";
              }}
            />
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
              <Secondary
                icon={Images}
                label="Image"
                onClick={() => imageInputRef.current?.click()}
              />
              <button
                onClick={cameraStream ? capturePhoto : startCamera}
                className="grid place-items-center rounded-sm bg-primary py-4 text-primary-foreground shadow-[0_4px_0_0_var(--color-foreground)] active:translate-y-0.5 active:shadow-[0_2px_0_0_var(--color-foreground)] lg:min-h-24"
              >
                <Camera className="h-6 w-6" strokeWidth={2.2} />
                <span className="mt-1 text-[10px] font-bold uppercase tracking-wider">
                  {cameraStream ? "Take photo" : "Camera"}
                </span>
              </button>
              <Secondary
                icon={FileUp}
                label="Document"
                onClick={() => documentInputRef.current?.click()}
              />
            </div>

            {cameraError ? (
              <p
                role="alert"
                className="mt-3 border border-destructive/40 bg-destructive/5 p-3 text-xs leading-relaxed text-destructive"
              >
                {cameraError}
              </p>
            ) : null}

            <p className="mt-5 rounded-sm border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
              Camera access starts only after you tap Camera. Allow the browser
              permission when prompted, or choose an image or PDF.
            </p>
            <div className="mt-3 hidden rounded-sm border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground lg:block">
              Images and PDFs can be previewed locally. OCR extraction and vault
              storage still need to be connected.
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 px-5 pt-5 lg:grid-cols-[minmax(320px,0.9fr)_minmax(360px,1fr)] lg:items-start lg:px-8">
          <div className="hidden overflow-hidden rounded-sm border border-foreground bg-foreground lg:block">
            <div className="relative aspect-[3/4]">
              {selectedFile?.type.startsWith("image/") && previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Selected bill preview"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              ) : selectedFile?.type === "application/pdf" && previewUrl ? (
                <iframe
                  src={previewUrl}
                  title={`Preview of ${selectedFile.name}`}
                  className="absolute inset-0 h-full w-full bg-background"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center bg-secondary p-6 text-center text-foreground">
                  <div>
                    <FileText className="mx-auto h-10 w-10" />
                    <p className="mt-3 break-all text-sm font-semibold">
                      {selectedFile?.name ?? "Document preview"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedFile?.type === "application/pdf"
                        ? "PDF document"
                        : "Document"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-sm border border-primary bg-primary/10 p-3">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs font-semibold">
                {selectedFile?.name ?? "Bill captured"} · Local preview only.
                OCR extraction and vault storage are not connected yet.
              </p>
            </div>

            <dl className="divide-y divide-border rounded-sm border border-border bg-card">
              {readFields.map(([label, value]) => (
                <div
                  key={label}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-0.5 truncate text-sm font-semibold">
                      {value}
                    </dd>
                  </div>
                  <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              ))}
            </dl>

            <div className="rounded-sm border border-border bg-card p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Remind me
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {["30 days before", "7 days before", "On the last day"].map(
                  (r, i) => (
                    <span
                      key={r}
                      className={`inline-flex items-center gap-1 rounded-sm px-2.5 py-1.5 text-xs font-semibold ${
                        i < 2
                          ? "bg-foreground text-background"
                          : "border border-border text-muted-foreground"
                      }`}
                    >
                      {i < 2 ? <Check className="h-3 w-3" /> : null}
                      {r}
                    </span>
                  ),
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  stopCamera();
                  setSelectedFile(null);
                  setStep("capture");
                }}
                className="rounded-sm border border-foreground px-4 py-3 text-sm font-bold"
              >
                Retake
              </button>
              <Link
                to="/home"
                className="flex-1 rounded-sm bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground shadow-[0_4px_0_0_var(--color-foreground)] active:translate-y-0.5 active:shadow-[0_2px_0_0_var(--color-foreground)]"
              >
                Save to vault
              </Link>
            </div>
          </div>
        </div>
      )}
    </PhoneShell>
  );
}

function Secondary({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Camera;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid place-items-center rounded-sm border border-border bg-card py-4 active:bg-secondary lg:grid-cols-[auto_1fr] lg:justify-items-start lg:gap-3 lg:px-5"
    >
      <Icon className="h-5 w-5" strokeWidth={2.2} />
      <span className="mt-1 text-[10px] font-bold uppercase tracking-wider">
        {label}
      </span>
    </button>
  );
}
