import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  ArrowUp,
  ArrowsClockwise,
  Plus,
  Trash,
  Paperclip,
  PaperPlaneRight,
  X,
  MagnifyingGlass,
  Check,
  Brain,
  Cpu,
  FileText,
  CaretDown,
  ArrowsOutSimple,
  ArrowsInSimple,
  ChatCircleDots,
  Key,
} from "@phosphor-icons/react";
import {
  agentChatStore,
  agentStore,
  toggleHooks,
  sendAgentChat,
  loadConversation,
  deleteConversation,
  startNewConversation,
  refreshConversationHistory,
  setSelectedModel,
  addAttachment,
  removeAttachment,
} from "./store";
import type { ModelInfo } from "./types";
import { agentService } from "../../platform/services";
import {
  CompanionAuthError,
  companionFetch,
  getCompanionToken,
  setCompanionToken,
} from "../../platform/companionUrl";
import { isNative } from "../../platform/native";
import { t } from "../../i18n";

function parseModelAndEffort(m: ModelInfo): { baseName: string; effort: string } {
  const match = m.name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (match) {
    return { baseName: match[1].trim(), effort: match[2].trim() };
  }
  const fallbackEffort =
    m.category === "fast" ? "Fast" : m.category === "reasoning" ? "High" : "Medium";
  return { baseName: m.name, effort: fallbackEffort };
}

export interface AgentChatBoxProps {
  fillHeight?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  mobile?: boolean;
}

export function AgentChatBox({
  fillHeight = false,
  isExpanded = false,
  onToggleExpand,
  mobile = false,
}: AgentChatBoxProps = {}) {
  const chat = agentChatStore.use();
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<"session" | "model" | "effort" | null>(null);
  const [modelQuery, setModelQuery] = useState("");
  const [sessionSearch, setSessionSearch] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [needsPairing, setNeedsPairing] = useState(false);
  const [pairCodeDraft, setPairCodeDraft] = useState(() => getCompanionToken());
  const [pairingSubmitting, setPairingSubmitting] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const isShowcase =
    typeof location !== "undefined" && new URLSearchParams(location.search).has("showcase");

  const isHookInstalled = Boolean(agentStore.use().isHookInstalled);
  const {
    selectedModel,
    availableModels,
    isStreaming,
    streamingText,
    messages,
    attachments,
    conversations,
    isLoadingHistory,
  } = chat;

  const checkPairingAuth = useCallback(async () => {
    if (isNative || isShowcase) return;
    try {
      await companionFetch("/api/history");
      setNeedsPairing(false);
    } catch (e) {
      if (e instanceof CompanionAuthError) {
        setNeedsPairing(true);
      }
    }
  }, [isShowcase]);

  useEffect(() => {
    if (mobile) {
      void checkPairingAuth();
    }
  }, [mobile, checkPairingAuth]);

  const submitPairing = async () => {
    const code = pairCodeDraft.trim().toUpperCase();
    if (!code) return;
    setPairingSubmitting(true);
    setPairingError(null);
    const prev = getCompanionToken();
    setCompanionToken(code);
    try {
      await companionFetch("/api/history");
      setNeedsPairing(false);
      void refreshConversationHistory();
      agentService.getAvailableModels().then((models) => {
        if (models.length > 0) {
          agentChatStore.set((cur) => ({ ...cur, availableModels: models }));
        }
      });
    } catch (e) {
      setCompanionToken(prev);
      setPairingError(
        e instanceof CompanionAuthError
          ? t("Kode pairing salah. Periksa lagi kode di Notch Windows.")
          : String(e),
      );
    } finally {
      setPairingSubmitting(false);
    }
  };

  // Group availableModels by baseName and effort for OpenCode-style split Model + Effort pickers
  const groupedModels = useMemo(() => {
    const map = new Map<
      string,
      { baseName: string; category: ModelInfo["category"]; variants: { effort: string; model: ModelInfo }[] }
    >();
    for (const m of availableModels) {
      const { baseName, effort } = parseModelAndEffort(m);
      const entry = map.get(baseName);
      if (entry) {
        if (!entry.variants.some((v) => v.effort === effort)) {
          entry.variants.push({ effort, model: m });
        }
      } else {
        map.set(baseName, {
          baseName,
          category: m.category,
          variants: [{ effort, model: m }],
        });
      }
    }
    return Array.from(map.values());
  }, [availableModels]);

  const currentModelObj = availableModels.find((m) => m.id === selectedModel);
  const currentParsed = currentModelObj
    ? parseModelAndEffort(currentModelObj)
    : {
        baseName: selectedModel.replace(/-high|-medium|-low/g, "").replace(/-/g, " "),
        effort: selectedModel.includes("medium")
          ? "Medium"
          : selectedModel.includes("low")
          ? "Low"
          : "High",
      };
  const currentBaseGroup = groupedModels.find((g) => g.baseName === currentParsed.baseName) ?? groupedModels[0];

  // The picker stays snappy with the full `agy models` list; the search narrows it.
  const filteredModels = useMemo(() => {
    const search = modelQuery.trim().toLowerCase();
    const list = search
      ? availableModels.filter((model) =>
          `${model.name ?? ""} ${model.id}`.toLowerCase().includes(search),
        )
      : availableModels;
    return list.slice(0, 80);
  }, [availableModels, modelQuery]);

  // `agy models` may drop a model between runs; never leave a dead id selected.
  useEffect(() => {
    if (availableModels.length === 0) return;
    if (availableModels.some((model) => model.id === selectedModel)) return;
    setSelectedModel(availableModels[0].id);
  }, [availableModels, selectedModel]);

  const filteredConversations = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const title = (c.title || "").toLowerCase();
      const preview = (c.preview || "").toLowerCase();
      const ws = (c.workspace || "").toLowerCase();
      return title.includes(q) || preview.includes(q) || ws.includes(q);
    });
  }, [conversations, sessionSearch]);
  const activeConversation = conversations.find((c) => c.id === chat.conversationId);

  // Auto-scroll inside messagesContainer only - NEVER scroll the window or push header off-screen
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages.length, streamingText]);

  // Handle Ctrl+V paste for screenshots and images
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (!file) continue;

        e.preventDefault();
        setIsUploading(true);

        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const dataUrl = reader.result as string;
            const base64Data = dataUrl.split(",")[1];
            const name = `screenshot_${Date.now()}.png`;

            const savedPath = await agentService.saveTempAttachment(
              name,
              base64Data,
              chat.conversationId || undefined
            );

            addAttachment(name, savedPath, dataUrl);
          } finally {
            setIsUploading(false);
          }
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  };

  // Handle file input selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      await new Promise<void>((resolve) => {
        reader.onload = async () => {
          try {
            const dataUrl = reader.result as string;
            const base64Data = dataUrl.split(",")[1];
            const savedPath = await agentService.saveTempAttachment(
              file.name,
              base64Data,
              chat.conversationId || undefined
            );
            addAttachment(
              file.name,
              savedPath,
              file.type.startsWith("image/") ? dataUrl : undefined
            );
          } finally {
            resolve();
          }
        };
        reader.readAsDataURL(file);
      });
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = () => {
    const prompt = draft.trim();
    if (!prompt || isStreaming) return;
    setDraft("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    void sendAgentChat(prompt);
  };

  const handleDeleteConversation = async (id: string) => {
    if (!window.confirm(t("Hapus percakapan ini dari riwayat?"))) return;
    const removed = await deleteConversation(id);
    if (!removed) window.alert(t("Gagal menghapus percakapan."));
  };

  if (needsPairing && mobile) {
    const chars = Array.from({ length: 8 }, (_, idx) => pairCodeDraft[idx] || "");
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
        <b className="ca-et" style={{ fontSize: 20, marginTop: 4 }}>
          {t("Pairing Antigravity Chat")}
        </b>
        <p className="ca-ep" style={{ margin: "10px 8px 0" }}>
          {t("Buka Notch Windows → Settings → Coding Agent → salin Kode pairing HP untuk membuka chat di HP ini.")}
        </p>
        <div className="relative my-5">
          <div className="ca-rw ca-ce" style={{ gap: 5 }}>
            {chars.map((ch, idx) => (
              <i
                key={idx}
                className={`ca-cell ${idx === pairCodeDraft.length ? "active" : ""}`}
              >
                {ch}
              </i>
            ))}
          </div>
          <input
            type="text"
            value={pairCodeDraft}
            onChange={(e) => setPairCodeDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitPairing();
            }}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={8}
            aria-label={t("Pairing Antigravity Chat")}
            className="absolute inset-0 w-full h-full opacity-0 cursor-text"
            autoFocus
          />
        </div>
        {pairingError && (
          <p className="mb-3 text-[12px] leading-relaxed" style={{ color: "var(--er)" }}>
            {pairingError}
          </p>
        )}
        <button
          type="button"
          disabled={pairingSubmitting || !pairCodeDraft.trim()}
          onClick={() => void submitPairing()}
          className="ca-bt max-w-[340px]"
        >
          {pairingSubmitting ? t("Menghubungkan…") : t("Hubungkan Chat")}
        </button>
      </div>
    );
  }

  return (
    <div className={`relative flex h-full w-full flex-col font-sans text-zinc-200 ${mobile ? "px-1" : ""} ${fillHeight ? "flex-1 min-h-0" : ""}`}>
      {/* Header: session picker, new session, connection state */}
      <div className={`flex shrink-0 items-center justify-between gap-2 ${mobile ? "py-0.5" : "border-b border-white/[0.05] py-1"}`}>
        <div className="relative flex min-w-0 items-center">
          <button
            type="button"
            onClick={() => {
              if (menu !== "session") void refreshConversationHistory();
              setMenu(menu === "session" ? null : "session");
            }}
            className={
              mobile
                ? "ca-chip min-w-0 shrink"
                : "flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.10]"
            }
          >
            {!mobile && <ChatCircleDots size={12} />}
            <span className={mobile ? "max-w-[110px] truncate" : "max-w-[160px] truncate"}>
              {activeConversation ? activeConversation.title || t("Percakapan") : t("Pilih sesi")}
            </span>
            <CaretDown size={mobile ? 13 : 10} weight="bold" className="shrink-0 text-zinc-400" />
          </button>

          {/* Session picker, same dropdown as the OpenCode view */}
          {menu === "session" && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
              <div className="absolute left-0 top-7 z-50 max-h-72 w-[min(20rem,85vw)] overflow-hidden rounded-xl border border-white/15 bg-[#16171d]/95 p-1.5 shadow-2xl backdrop-blur-xl flex flex-col">
                {/* Search Bar */}
                <div className="relative mb-1 flex items-center rounded-lg border border-white/10 bg-black/40 px-2 py-1">
                  <MagnifyingGlass size={12} className="shrink-0 text-zinc-500 mr-1.5" />
                  <input
                    type="text"
                    value={sessionSearch}
                    onChange={(e) => setSessionSearch(e.target.value)}
                    placeholder={t("Cari riwayat sesi…")}
                    className="w-full bg-transparent text-[11px] text-zinc-200 placeholder-zinc-500 outline-none"
                    autoFocus
                  />
                  {sessionSearch && (
                    <button
                      type="button"
                      onClick={() => setSessionSearch("")}
                      className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded cursor-pointer"
                    >
                      <X size={11} weight="bold" />
                    </button>
                  )}
                </div>

                {/* Quick New Session Button */}
                <button
                  type="button"
                  onClick={() => {
                    startNewConversation();
                    setMenu(null);
                    setSessionSearch("");
                  }}
                  className="mb-1 flex w-full items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-left text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                >
                  <Plus size={11} weight="bold" />
                  <span>{sessionSearch.trim() ? t("Buat sesi dengan nama ini") : t("Buat sesi baru")}</span>
                </button>

                {/* Session list or Not Found */}
                <div className="max-h-56 overflow-y-auto pr-0.5">
                  {isLoadingHistory && (
                    <div className="px-2 py-4 text-center text-[11px] text-zinc-500">
                      {t("Memuat riwayat sesi...")}
                    </div>
                  )}
                  {!isLoadingHistory && filteredConversations.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-4 px-2 text-center">
                      <p className="text-[11px] text-zinc-400">
                        {sessionSearch ? t("Sesi tidak ditemukan") : t("Tidak ada percakapan ditemukan")}
                      </p>
                    </div>
                  )}
                  {filteredConversations.map((c) => (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        void loadConversation(c.id);
                        setMenu(null);
                        setSessionSearch("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        void loadConversation(c.id);
                        setMenu(null);
                        setSessionSearch("");
                      }}
                      className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] transition-colors cursor-pointer ${
                        c.id === chat.conversationId ? "bg-white/[0.10] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.06]"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{c.title || "Untitled Session"}</span>
                      <span className="shrink-0 text-[10px] text-zinc-600">
                        {c.lastModified.split(" ")[0]}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteConversation(c.id);
                        }}
                        className="shrink-0 rounded p-0.5 text-zinc-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100 cursor-pointer"
                        title={t("Hapus percakapan")}
                      >
                        <Trash size={11} weight="bold" />
                      </button>
                      {c.id === chat.conversationId && <Check size={12} weight="bold" className="shrink-0 text-emerald-400" />}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => startNewConversation()}
            className={
              mobile
                ? "ca-ib"
                : "rounded-full border border-emerald-500/25 bg-emerald-500/10 p-1.5 text-emerald-300 transition-colors hover:bg-emerald-500/20"
            }
            title={t("Sesi baru")}
          >
            <Plus size={mobile ? 18 : 12} weight="bold" />
          </button>
          <button
            type="button"
            onClick={() => void refreshConversationHistory()}
            className={
              mobile
                ? "ca-ib"
                : "rounded-full border border-white/10 bg-white/[0.06] p-1.5 text-zinc-400 transition-colors hover:text-zinc-200"
            }
            title={t("Segarkan")}
          >
            <ArrowsClockwise size={mobile ? 18 : 12} weight={mobile ? "bold" : "regular"} />
          </button>
          {mobile && (
            <button
              type="button"
              onClick={() => {
                setPairCodeDraft(getCompanionToken());
                setPairingError(null);
                setNeedsPairing(true);
              }}
              className="ca-ib"
              title={t("Ubah kode pairing")}
            >
              <Key size={18} weight="bold" />
            </button>
          )}
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              className={mobile ? "ca-ib" : "rounded-full border border-white/10 bg-white/[0.06] p-1.5 text-zinc-400 transition-colors hover:text-zinc-200"}
              title={isExpanded ? t("Kembalikan Tampilan Normal") : t("Perluas Chat ke Layar Penuh")}
            >
              {isExpanded ? (
                <ArrowsInSimple size={mobile ? 18 : 12} weight="bold" />
              ) : (
                <ArrowsOutSimple size={mobile ? 18 : 12} weight="bold" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Model + effort of the current session, the same two-pill row as OpenCode */}
      <div className={`relative flex shrink-0 items-center gap-2 ${mobile ? "mt-1.5 mb-1" : "py-1"}`}>
        <button
          type="button"
          onClick={() => setMenu(menu === "model" ? null : "model")}
          className={
            mobile
              ? "ca-chip d"
              : "flex min-w-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-zinc-400 transition-colors hover:bg-white/[0.08]"
          }
          title={t("Pilih model Antigravity")}
        >
          {!mobile && <Cpu size={11} />}
          <span className="max-w-[170px] truncate">{currentParsed.baseName}</span>
          <CaretDown size={mobile ? 13 : 9} weight="bold" className="shrink-0 text-zinc-600" />
        </button>
        <button
          type="button"
          onClick={() => setMenu(menu === "effort" ? null : "effort")}
          className={
            mobile
              ? "ca-chip d"
              : "flex min-w-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-zinc-400 transition-colors hover:bg-white/[0.08]"
          }
          title={t("Effort")}
        >
          {!mobile && <Brain size={11} />}
          <span className="max-w-[100px] truncate">{currentParsed.effort}</span>
          <CaretDown size={mobile ? 13 : 9} weight="bold" className="shrink-0 text-zinc-600" />
        </button>

        {/* Model picker, auto-detected from `agy models` */}
        {menu === "model" && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
            <div className="absolute left-0 top-7 z-50 w-[min(21rem,88vw)] overflow-hidden rounded-xl border border-white/15 bg-[#16171d]/95 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-2.5 py-1.5">
                <MagnifyingGlass size={11} className="shrink-0 text-zinc-500" />
                <input
                  autoFocus
                  value={modelQuery}
                  onChange={(event) => setModelQuery(event.target.value)}
                  placeholder={t("Cari model…")}
                  className="w-full bg-transparent text-[11.5px] text-zinc-200 outline-none placeholder:text-zinc-600"
                />
              </div>
              <div className="max-h-56 overflow-y-auto p-1.5">
                {availableModels.length === 0 && (
                  <div className="px-2 py-2 text-[11px] text-zinc-500">{t("Memuat model…")}</div>
                )}
                {availableModels.length > 0 && filteredModels.length === 0 && (
                  <div className="px-2 py-2 text-[11px] text-zinc-500">{t("Model tidak ditemukan.")}</div>
                )}
                {filteredModels.map((m) => {
                  const active = m.id === selectedModel;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedModel(m.id);
                        setMenu(null);
                        setModelQuery("");
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                        active ? "bg-white/[0.10] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.06]"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate text-[11.5px]">{m.name}</span>
                      <span className="shrink-0 text-[10px] text-zinc-600">{m.category}</span>
                      {active && <Check size={12} weight="bold" className="shrink-0 text-emerald-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Effort picker, the efforts that exist for the selected model */}
        {menu === "effort" && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
            <div className="absolute left-24 top-7 z-50 max-h-64 w-[min(15rem,80vw)] overflow-y-auto rounded-xl border border-white/15 bg-[#16171d]/95 p-1.5 shadow-2xl backdrop-blur-xl">
              {(currentBaseGroup?.variants ?? []).map((variant) => {
                const active = variant.model.id === selectedModel;
                return (
                  <button
                    key={variant.model.id}
                    type="button"
                    onClick={() => {
                      setSelectedModel(variant.model.id);
                      setMenu(null);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] transition-colors ${
                      active ? "bg-white/[0.10] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{variant.effort}</span>
                    {active && <Check size={12} weight="bold" className="shrink-0 text-emerald-400" />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Transcript */}
      <div ref={messagesContainerRef} className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1 ${mobile ? "py-2" : "py-1.5"}`}>
        {!isHookInstalled && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-200">
            <div className="flex items-center justify-between gap-2">
              <span>{t("Antigravity tidak terbuka atau belum terhubung.")}</span>
              <button
                type="button"
                onClick={() => void toggleHooks(true)}
                className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200 transition-colors hover:bg-amber-500/25 cursor-pointer"
              >
                {t("Hubungkan")}
              </button>
            </div>
          </div>
        )}
        {messages.length === 0 && !isStreaming && (
          mobile ? (
            <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
              <div className="ca-ei" style={{ marginTop: 18 }}>
                <ChatCircleDots size={26} weight="bold" />
              </div>
              <b className="ca-et">
                {chat.conversationId ? t("Sesi ini belum punya pesan.") : t("Pilih sesi")}
              </b>
              <p className="ca-ep">
                {chat.conversationId ? t("Ketik instruksi untuk Antigravity atau paste screenshot…") : t("Pilih sesi untuk melihat isinya.")}
              </p>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center px-4 text-center text-[11.5px] text-zinc-500">
              {chat.conversationId ? t("Sesi ini belum punya pesan.") : t("Pilih sesi untuk melihat isinya.")}
            </div>
          )
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex flex-col items-end">
              <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-xs border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[12.5px] leading-relaxed text-zinc-100 select-text">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex flex-col items-start">
              <div className="max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-xs border border-sky-500/25 bg-[#1c1d25] px-3 py-2 text-[12.5px] leading-relaxed text-zinc-200 shadow-sm select-text">
                {m.content}
              </div>
            </div>
          ),
        )}
        {isStreaming && streamingText && (
          <div className="flex flex-col items-start">
            <div className="max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-xs border border-sky-500/25 bg-[#1c1d25] px-3 py-2 text-[12.5px] leading-relaxed text-zinc-200 shadow-sm">
              {streamingText}
              <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse bg-sky-400 align-middle" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      {mobile ? (
        <div className="mt-auto flex shrink-0 flex-col pt-1.5">
          {attachments.length > 0 && (
            <div className="flex items-center gap-1.5 mb-1.5 overflow-x-auto pb-0.5">
              {attachments.map((att, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11.5px] shrink-0"
                  style={{ background: "var(--cd)", borderColor: "var(--ln)", color: "var(--tx)" }}
                >
                  {att.previewUrl ? (
                    <img src={att.previewUrl} alt={att.name} className="w-4 h-4 rounded object-cover" />
                  ) : (
                    <FileText size={13} weight="bold" />
                  )}
                  <span className="max-w-[120px] truncate">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="p-0.5 rounded cursor-pointer"
                  >
                    <X size={11} weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="ca-cp">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!isHookInstalled || isUploading || isStreaming}
              className="ca-ib"
              title={t("Lampirkan file atau screenshot (bisa Ctrl+V)")}
            >
              <Paperclip size={20} weight="bold" className={isUploading ? "animate-spin" : ""} />
            </button>
            <textarea
              ref={textareaRef}
              value={draft}
              rows={1}
              disabled={!isHookInstalled || isStreaming}
              placeholder={
                !isHookInstalled
                  ? t("Antigravity tidak terbuka atau belum terhubung")
                  : t("Ketik instruksi untuk Antigravity atau paste screenshot…")
              }
              onPaste={handlePaste}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              className="max-h-24 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[14.5px] outline-none [scrollbar-width:none] disabled:cursor-not-allowed"
              style={{ color: "var(--tx)" }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!isHookInstalled || isStreaming || (!draft.trim() && attachments.length === 0)}
              className={`ca-sd ${!isHookInstalled || isStreaming || (!draft.trim() && attachments.length === 0) ? "d" : ""}`}
              title={t("Kirim")}
            >
              <ArrowUp size={18} weight="bold" />
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex shrink-0 flex-col border-t border-white/[0.06] pt-1.5">
          {attachments.length > 0 && (
            <div className="flex items-center gap-1.5 mb-1.5 overflow-x-auto pb-0.5">
              {attachments.map((att, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/10 border border-white/15 text-[11px] text-zinc-300 shrink-0"
                >
                  {att.previewUrl ? (
                    <img src={att.previewUrl} alt={att.name} className="w-3.5 h-3.5 rounded object-cover" />
                  ) : (
                    <FileText size={12} weight="bold" className="text-zinc-400" />
                  )}
                  <span className="max-w-[120px] truncate">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="text-zinc-400 hover:text-white p-0.5 rounded hover:bg-white/10 cursor-pointer"
                  >
                    <X size={10} weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!isHookInstalled || isUploading || isStreaming}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-white/10 transition-colors disabled:pointer-events-none disabled:opacity-40 cursor-pointer"
              title={t("Lampirkan file atau screenshot (bisa Ctrl+V)")}
            >
              <Paperclip size={15} weight="bold" className={isUploading ? "animate-spin" : ""} />
            </button>
            <textarea
              ref={textareaRef}
              value={draft}
              rows={1}
              disabled={!isHookInstalled || isStreaming}
              placeholder={
                !isHookInstalled
                  ? t("Antigravity tidak terbuka atau belum terhubung")
                  : t("Ketik instruksi untuk Antigravity atau paste screenshot…")
              }
              onPaste={handlePaste}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              className="max-h-24 min-h-[32px] flex-1 resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-500/40 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!isHookInstalled || isStreaming || (!draft.trim() && attachments.length === 0)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/15 text-sky-300 transition-colors hover:bg-sky-500/25 disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
              title={t("Kirim")}
            >
              <PaperPlaneRight size={13} weight="fill" />
            </button>
          </div>
        </div>
      )}

      {/* Footer: which agent we are talking to */}
      {!mobile && (
        <div className="mt-1 shrink-0 truncate text-[10px] text-zinc-600">
          {isHookInstalled ? "Antigravity · agy CLI" : t("Antigravity tidak terhubung")}
        </div>
      )}
    </div>
  );
}
