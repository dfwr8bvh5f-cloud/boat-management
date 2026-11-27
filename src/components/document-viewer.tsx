"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { CloseButton } from "@/components/close-button";
import { Modal } from "@/components/modal";
import { isPdfUrl } from "@/lib/upload";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

// The one way every document, receipt, invoice, quote or photo is viewed in
// the app: a viewer window over the current page (the page, its scroll
// position and any open form stay as they were), with a close button and an
// "open in new tab" button for the cases where the browser's own PDF viewer is
// nicer (e.g. multi-page PDFs on iPhone). Mounted once, in the signed-in
// layout; any component calls `openDocument(url)` from `useDocumentViewer()`
// instead of window.open / target="_blank" / its own lightbox.
//
// kind picks how the file is shown: "pdf" in a frame, "image" as a picture,
// "other" (e.g. a Word file the browser cannot preview) goes straight to a new
// tab. Left out, it is guessed from the URL like the old per-screen lightboxes
// did: a .pdf URL is a PDF, anything else is shown as an image.
export type DocumentKind = "pdf" | "image" | "other";

type OpenDocument = (url: string, options?: { kind?: DocumentKind }) => void;

// Outside the provider (e.g. a public page) fall back to a plain new tab, so a
// call never silently does nothing.
const DocumentViewerContext = createContext<OpenDocument>((url) => {
  window.open(url, "_blank", "noopener,noreferrer");
});

export function useDocumentViewer(): { openDocument: OpenDocument } {
  const openDocument = useContext(DocumentViewerContext);
  return useMemo(() => ({ openDocument }), [openDocument]);
}

// File names -> how to show them, for callers that know the stored file's name
// but whose URL has no extension (e.g. the documents download route).
export function documentKindFromName(name: string | null | undefined): DocumentKind {
  const ext = (name ?? "").split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp"].includes(ext)) return "image";
  return "other";
}

export function DocumentViewerProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [current, setCurrent] = useState<{ url: string; kind: "pdf" | "image" } | null>(null);
  const [broken, setBroken] = useState(false);

  const openDocument = useCallback<OpenDocument>((url, options) => {
    const kind = options?.kind ?? (isPdfUrl(url) ? "pdf" : "image");
    if (kind === "other") {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setBroken(false);
    setCurrent({ url, kind });
  }, []);

  return (
    <DocumentViewerContext.Provider value={openDocument}>
      {children}
      {current && (
        <Modal tone="viewer" onClose={() => setCurrent(null)} className="print:hidden">
          <CloseButton label={t("close_word")} onClick={() => setCurrent(null)} variant="overlay" />
          <a
            href={current.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("open_in_new_tab")}
            title={t("open_in_new_tab")}
            onClick={(e) => e.stopPropagation()}
            className="absolute end-16 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-fleet-navy transition-transform active:scale-[0.97]"
          >
            <ExternalLink size={16} aria-hidden="true" />
          </a>
          {current.kind === "pdf" ? (
            <iframe
              src={`${current.url}#view=FitH`}
              title="document"
              className="h-[85vh] w-[90vw] rounded-lg bg-white"
              onClick={(e) => e.stopPropagation()}
            />
          ) : broken ? (
            <a
              href={current.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded-lg bg-white px-4 py-3 text-sm font-bold text-fleet-navy"
            >
              {t("open_in_new_tab")}
            </a>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.url}
              alt=""
              onError={() => setBroken(true)}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </Modal>
      )}
    </DocumentViewerContext.Provider>
  );
}
