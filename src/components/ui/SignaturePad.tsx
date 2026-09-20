"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface SignaturePadProps {
  onSignature: (dataUrl: string) => void;
  onClear?: () => void;
  width?: number;
  height?: number;
  disabled?: boolean;
  existingSignature?: string;
}

export function SignaturePad({
  onSignature,
  onClear,
  width = 400,
  height = 200,
  disabled = false,
  existingSignature,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = "#071e27";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (existingSignature) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        setHasSignature(true);
      };
      img.src = existingSignature;
    }
  }, [width, height, existingSignature]);

  const getPos = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    },
    []
  );

  const startDraw = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      const pos = getPos(e);
      lastPoint.current = pos;
      setIsDrawing(true);
      setHasSignature(true);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    },
    [disabled, getPos]
  );

  const draw = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!isDrawing || disabled) return;
      e.preventDefault();
      const pos = getPos(e);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (lastPoint.current) {
        const midX = (lastPoint.current.x + pos.x) / 2;
        const midY = (lastPoint.current.y + pos.y) / 2;
        ctx.quadraticCurveTo(lastPoint.current.x, lastPoint.current.y, midX, midY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(midX, midY);
      }
      lastPoint.current = pos;
    },
    [isDrawing, disabled, getPos]
  );

  const endDraw = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPoint.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSignature(dataUrl);
  }, [isDrawing, onSignature]);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onSignature("");
    onClear?.();
  }, [onSignature, onClear]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low">
        <canvas
          ref={canvasRef}
          className={`touch-none w-full rounded-xl ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-crosshair"}`}
          style={{ height: `${height}px` }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasSignature && !disabled && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="font-body-md text-body-md text-outline">
              Signez ici avec le doigt ou la souris
            </span>
          </div>
        )}
      </div>
      {!disabled && hasSignature && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1.5 rounded-xl bg-surface-container-high px-3 py-1.5 font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-highest"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
            Effacer la signature
          </button>
        </div>
      )}
      {existingSignature && disabled && (
        <p className="font-label-sm text-label-sm text-on-surface-variant">
          Signature enregistrée le {new Date().toLocaleDateString("fr-FR")}
        </p>
      )}
    </div>
  );
}
