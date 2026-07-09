"use client";

import { useState } from "react";
import { documentFileName } from "@/lib/document-filename";
import type { BoatDocument } from "@/lib/types/database";

// Shares the actual file (not just a link) so WhatsApp/Mail/etc. can attach
// it directly, without the recipient needing to log into the app - falls
// back to just opening the document if the browser can't share files (most
// desktop browsers).
export function useDocumentShare(boatId: string) {
  const [sharingId, setSharingId] = useState<string | null>(null);

  const shareDocument = async (doc: BoatDocument) => {
    setSharingId(doc.id);
    try {
      const res = await fetch(`/boats/${boatId}/documents/${doc.id}/download?download=1`);
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const filename = documentFileName(doc.name, doc.file_path);
      const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: doc.name });
      } else if (navigator.share) {
        await navigator.share({ title: doc.name, url: `${location.origin}/boats/${boatId}/documents/${doc.id}/download` });
      } else {
        window.open(`/boats/${boatId}/documents/${doc.id}/download`, "_blank");
      }
    } catch (e) {
      // AbortError just means she closed the share sheet - not a real failure.
      if (e instanceof Error && e.name !== "AbortError") {
        window.open(`/boats/${boatId}/documents/${doc.id}/download`, "_blank");
      }
    } finally {
      setSharingId(null);
    }
  };

  return { sharingId, shareDocument };
}
