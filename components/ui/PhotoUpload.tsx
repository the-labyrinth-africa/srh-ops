"use client";

import { useRef, useState, useCallback } from "react";
import { compressImageFile } from "@/lib/image-compress";

interface Photo {
  url: string;
  nom: string;
  uploadedAt?: string;
}

interface PhotoUploadProps {
  operationId: string;
  existingPhotos?: Photo[];
  onPhotosChange?: (photos: Photo[]) => void;
  disabled?: boolean;
  maxPhotos?: number;
}

export function PhotoUpload({
  operationId,
  existingPhotos = [],
  onPhotosChange,
  disabled = false,
  maxPhotos = 10,
}: PhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>(existingPhotos);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);

      const remaining = maxPhotos - photos.length;
      if (remaining <= 0) {
        setError(`Maximum de ${maxPhotos} photos atteint.`);
        return;
      }

      const filesToUpload = Array.from(files).slice(0, remaining);
      setUploading(true);

      try {
        const uploaded: Photo[] = [];

        for (const file of filesToUpload) {
          // Redimensionnement local : l'API plafonne à 2 Mo par photo.
          let dataUrl: string | null;
          try {
            dataUrl = await compressImageFile(file);
          } catch (err) {
            setError(err instanceof Error ? err.message : `Le fichier "${file.name}" est illisible.`);
            continue;
          }
          if (!dataUrl) {
            setError(`Le fichier "${file.name}" reste trop lourd même après compression.`);
            continue;
          }

          const res = await fetch(`/api/operations/${operationId}/photos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photo: dataUrl, nom: file.name }),
          });

          if (!res.ok) {
            const data = await res.json();
            setError(data.error || `Erreur lors de l'upload de "${file.name}".`);
            continue;
          }

          const saved = await res.json();
          uploaded.push(saved.photo);
        }

        if (uploaded.length > 0) {
          const updated = [...photos, ...uploaded];
          setPhotos(updated);
          onPhotosChange?.(updated);
        }
      } catch {
        setError("Erreur lors de l'upload des photos.");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
      }
    },
    [operationId, photos, maxPhotos, onPhotosChange]
  );

  const handleDelete = useCallback(
    async (index: number) => {
      const photo = photos[index];
      try {
        const res = await fetch(`/api/operations/${operationId}/photos`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: photo.url }),
        });

        if (res.ok) {
          const updated = photos.filter((_, i) => i !== index);
          setPhotos(updated);
          onPhotosChange?.(updated);
        }
      } catch {
        setError("Erreur lors de la suppression.");
      }
    },
    [operationId, photos, onPhotosChange]
  );

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-xl bg-error-container/20 p-3 font-body-md text-body-md text-on-error-container">
          {error}
        </div>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo, i) => (
            <div key={i} className="group relative overflow-hidden rounded-xl border border-outline-variant/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.nom || `Photo ${i + 1}`}
                className="aspect-square w-full object-cover"
              />
              <div className="absolute inset-0 bg-inverse-surface/0 transition-colors group-hover:bg-inverse-surface/30">
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleDelete(i)}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-error text-on-error opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                )}
              </div>
              <div className="absolute bottom-0 inset-x-0 bg-inverse-surface/60 px-2 py-1">
                <span className="font-label-sm text-label-sm text-inverse-on-surface truncate block">
                  {photo.nom || `Photo ${i + 1}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!disabled && photos.length < maxPhotos && (
        <div className="flex flex-wrap gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-2.5 font-label-md text-label-md text-on-surface hover:bg-surface-container-high disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span>
            {uploading ? "Envoi en cours..." : "Ajouter des photos"}
          </button>

          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-2.5 font-label-md text-label-md text-on-surface hover:bg-surface-container-high disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">photo_camera</span>
            {uploading ? "Envoi en cours..." : "Prendre une photo"}
          </button>
        </div>
      )}

      <p className="font-label-sm text-label-sm text-outline">
        {photos.length}/{maxPhotos} photos • Formats: JPG, PNG • Réduites automatiquement
        (max 2 Mo par photo, 8 Mo par opération)
      </p>
    </div>
  );
}
