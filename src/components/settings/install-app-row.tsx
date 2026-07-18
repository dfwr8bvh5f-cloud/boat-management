"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  clearDeferredPrompt,
  detectPwaPlatform,
  getDeferredPrompt,
  isRunningStandalone,
  markInstalled,
  subscribePwaInstall,
  wasInstallEventSeen,
} from "@/lib/pwa-install";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import { SettingsRow } from "./settings-row";
import { IosInstallModal } from "./ios-install-modal";

export function InstallAppRow({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [installed, setInstalled] = useState(false);
  const [hasPrompt, setHasPrompt] = useState(false);
  const [platform, setPlatform] = useState<ReturnType<typeof detectPwaPlatform>>("other");
  const [showIosModal, setShowIosModal] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setInstalled(isRunningStandalone() || wasInstallEventSeen());
      setHasPrompt(Boolean(getDeferredPrompt()));
    };
    // Deferred a tick, same as the push-subscription hook's initial read -
    // these read browser-only globals that can't be known during the
    // server-rendered first pass, so the synchronous update is pushed past
    // mount instead of running directly in the effect body.
    Promise.resolve().then(() => {
      setPlatform(detectPwaPlatform());
      refresh();
    });
    return subscribePwaInstall(refresh);
  }, []);

  if (installed) {
    return <SettingsRow icon={Download} label={t("settings_app_installed")} disabled />;
  }

  const onInstall = async () => {
    if (platform === "ios") {
      setShowIosModal(true);
      return;
    }
    const prompt = getDeferredPrompt();
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    clearDeferredPrompt();
    if (choice.outcome === "accepted") markInstalled();
  };

  // Nothing actionable yet (Chrome/Edge haven't fired beforeinstallprompt -
  // e.g. it was already dismissed too many times, or hasn't evaluated the
  // page yet) and this isn't iOS - no working install action to offer.
  if (platform !== "ios" && !hasPrompt) return null;

  return (
    <>
      <SettingsRow icon={Download} label={t("settings_install_row")} onClick={onInstall} />
      {showIosModal && <IosInstallModal locale={locale} onClose={() => setShowIosModal(false)} />}
    </>
  );
}
