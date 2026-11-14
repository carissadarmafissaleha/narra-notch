import { useEffect, useState } from "react";
import {
  Globe,
  Trash,
  CheckCircle,
  XCircle,
  Clock,
  Sparkle,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { WhatsAppLogo } from "../../ui/brands";
import { Button, Segmented, TextField, Select } from "../../ui/controls";
import { HeaderActions, HeaderButton } from "../../notch/header";
import { navigate } from "../../notch/nav";
import { t } from "../../i18n";
import {
  whatsappStore,
  openDirectWhatsApp,
  toggleWhatsAppWebWindow,
  closeWhatsAppWebWindow,
  syncWhatsAppWebStatus,
  clearRecentChats,
  setWhatsAppCountryCode,
} from "./store";

const COUNTRY_OPTIONS = [
  { value: "+62", label: "🇮🇩 +62 (Indonesia)" },
  { value: "+60", label: "🇲🇾 +60 (Malaysia)" },
  { value: "+65", label: "🇸🇬 +65 (Singapore)" },
  { value: "+1",  label: "🇺🇸 +1 (US / CA)" },
  { value: "+44", label: "🇬🇧 +44 (UK)" },
  { value: "+966",label: "🇸🇦 +966 (Saudi)" },
  { value: "+971",label: "🇦🇪 +971 (UAE)" },
  { value: "+81", label: "🇯🇵 +81 (Japan)" },
  { value: "+61", label: "🇦🇺 +61 (Australia)" },
  { value: "+49", label: "🇩🇪 +49 (Germany)" },
];

export function WhatsAppView() {
  const state = whatsappStore.use();
  const [tab, setTab] = useState<"direct" | "companion">("direct");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sentFeedback, setSentFeedback] = useState(false);

  useEffect(() => {
    syncWhatsAppWebStatus();
    const interval = setInterval(syncWhatsAppWebStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSend = async () => {
    if (!phone.trim()) return;
    await openDirectWhatsApp(phone, message, "web");
    setSentFeedback(true);
    setTimeout(() => setSentFeedback(false), 2500);
  };

  const actions = (
    <HeaderActions>
      <HeaderButton label={t("Einstellungen")} onClick={() => navigate("settings", "tools")}>
        <SlidersHorizontal size={14} weight="bold" />
      </HeaderButton>
    </HeaderActions>
  );

  return (
    <div className="flex h-full flex-col p-4 text-label">
      {actions}

      {/* Header & Mode Switcher */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#25D366]/20 text-[#25D366]">
            <WhatsAppLogo size={14} />
          </div>
          <div>
            <h2 className="text-body font-semibold">{t("WhatsApp")}</h2>
          </div>
        </div>
        <Segmented
          id="wa-tab"
          size="sm"
          value={tab}
          onChange={(v) => setTab(v)}
          options={[
            { value: "direct", label: t("Kirim Cepat") },
            { value: "companion", label: t("Web Companion") },
          ]}
        />
      </div>

      {tab === "direct" ? (
        <div className="flex flex-1 flex-col gap-3">
          {/* Phone Number & Country Prefix Input */}
          <div className="flex flex-col gap-2 rounded-xl bg-fill-1 p-2.5">
            <span className="text-caption font-medium text-label-2">
              {t("Kirim Pesan Tanpa Simpan Nomor")}
            </span>

            {/* Custom Select Dropdown & Phone Input */}
            <div className="flex items-center gap-2">
              <Select
                value={state.countryCode}
                onChange={(v) => setWhatsAppCountryCode(v)}
                options={COUNTRY_OPTIONS}
                width="w-36"
              />
              <div className="flex-1">
                <TextField
                  value={phone}
                  onChange={setPhone}
                  placeholder={t("Contoh: 081234567890")}
                  width="w-full"
                  autoFocus
                  onSubmit={() => handleSend()}
                />
              </div>
            </div>

            {/* Optional message input */}
            <div className="mt-1">
              <TextField
                value={message}
                onChange={setMessage}
                placeholder={t("Pesan teks (opsional)...")}
                width="w-full"
                onSubmit={() => handleSend()}
              />
            </div>

            {/* Action button */}
            <div className="mt-1.5 flex items-center justify-end">
              <Button
                primary
                disabled={!phone.trim()}
                onClick={() => handleSend()}
                icon={Globe}
              >
                {sentFeedback ? t("Terkirim ✓") : t("Buka Web")}
              </Button>
            </div>
          </div>

          {/* Recent Direct Chats */}
          {state.recentChats.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="flex items-center gap-1 text-[11px] font-medium text-label-3">
                  <Clock size={12} /> {t("Riwayat Nomor Cepat")}
                </span>
                <button
                  type="button"
                  onClick={clearRecentChats}
                  className="flex items-center gap-1 text-[11px] text-label-3 hover:text-red-400"
                >
                  <Trash size={11} /> {t("Hapus")}
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {state.recentChats.map((c) => (
                  <button
                    key={c.phone}
                    type="button"
                    onClick={() => {
                      setPhone(c.phone);
                    }}
                    className="flex items-center gap-1.5 rounded-full bg-fill-1 px-2.5 py-1 text-caption text-label-2 hover:bg-fill-2 hover:text-label"
                  >
                    <span className="font-medium text-[#25D366]">
                      {c.formatted}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Web Companion Mode (Lazy Loaded, 0 MB Idle) */
        <div className="flex flex-1 flex-col justify-between gap-3 rounded-xl bg-fill-1 p-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-caption font-semibold text-label">
                {t("WhatsApp Web Mini Companion")}
              </span>
              <span
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  state.webActive
                    ? "bg-[#25D366]/20 text-[#25D366]"
                    : "bg-fill-2 text-label-3"
                }`}
              >
                {state.webActive ? (
                  <>
                    <CheckCircle size={12} weight="fill" /> {t("Webview Aktif (~100 MB)")}
                  </>
                ) : (
                  <>
                    <XCircle size={12} weight="fill" /> {t("Mati (0 MB RAM)")}
                  </>
                )}
              </span>
            </div>

            <p className="text-footnote leading-relaxed text-label-2">
              {t(
                "WhatsApp Web dimuat secara hemat memori (on-demand). Saat jendela ditutup atau Anda logout, proses Webview langsung dimatikan sehingga penggunaan RAM kembali ke 0 MB.",
              )}
            </p>

            <div className="mt-1 rounded-lg bg-fill-2 p-2.5 text-caption text-label-3">
              <div className="flex items-center gap-1.5 font-medium text-label-2">
                <Sparkle size={13} className="text-[#25D366]" />
                {t("Keunggulan Fitur:")}
              </div>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11.5px]">
                <li>{t("Tidak membebani RAM laptop saat idle (0 MB)")}</li>
                <li>{t("Langsung tersambung tanpa perlu scan QR ulang setiap buka")}</li>
                <li>{t("Bisa ditutup kapan saja dengan 1 tombol untuk membersihkan memori")}</li>
              </ul>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            {state.webActive && (
              <Button onClick={closeWhatsAppWebWindow} icon={Trash}>
                {t("Tutup & Bebaskan RAM (0 MB)")}
              </Button>
            )}
            <Button
              primary
              onClick={toggleWhatsAppWebWindow}
              icon={Globe}
            >
              {state.webActive ? t("Tampilkan Jendela Web") : t("Buka WhatsApp Web")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
