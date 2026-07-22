"use client";

import { useEffect, useState } from "react";
import { Download, Menu, Share, SquarePlus } from "lucide-react";
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
import { InstallStepsModal } from "./install-steps-modal";

export function InstallAppRow({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<ReturnType<typeof detectPwaPlatform>>("other");
  const [modal, setModal] = useState<"ios" | "manual" | null>(null);

  useEffect(() => {
    const refresh = () => setInstalled(isRunningStandalone() || wasInstallEventSeen());
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
      setModal("ios");
      return;
    }
    const prompt = getDeferredPrompt();
    if (!prompt) {
      // Chrome/Edge haven't fired beforeinstallprompt yet for this session
      // (e.g. it hasn't finished evaluating the page, or the prompt was
      // already dismissed too many times recently) - that doesn't mean the
      // browser can't install it, just that our own JS-triggered dialog
      // isn't available right now. Point at the browser's own install
      // affordance instead of silently doing nothing.
      setModal("manual");
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    clearDeferredPrompt();
    if (choice.outcome === "accepted") markInstalled();
  };

  return (
    <>
      <SettingsRow icon={Download} label={t("settings_install_row")} onClick={onInstall} />
      {modal === "ios" && (
        <InstallStepsModal
          locale={locale}
          title={t("settings_install_modal_title")}
          steps={[
            { icon: Share, text: t("settings_install_step1") },
            { icon: SquarePlus, text: t("settings_install_step2") },
            { icon: SquarePlus, text: t("settings_install_step3") },
          ]}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "manual" && (
        <InstallStepsModal
          locale={locale}
          title={t("settings_install_modal_title")}
          steps={[
            { icon: Download, text: t("settings_install_manual_step1") },
            { icon: Menu, text: t("settings_install_manual_step2") },
          ]}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
