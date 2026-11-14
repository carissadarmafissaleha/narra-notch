import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  ArrowUp,
  ArrowsClockwise,
  ClockCounterClockwise,
  Plus,
  Trash,
  Paperclip,
  X,
  MagnifyingGlass,
  Check,
  Lightning,
  Brain,
  FileText,
  CaretDown,
  ArrowsOutSimple,
  ArrowsInSimple,
  ChatCircleDots,
  FolderSimple,
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
  clearChat,
  refreshConversationHistory,
  setSelectedModel,
  addAttachment,
  removeAttachment,
  toggleHistoryDrawer,
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
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState<"session" | "model" | "effort" | null>(null);
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
    isHistoryOpen,
    conversations,
    historyQuery,
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

  const currentModelLabel = currentModelObj
    ? currentModelObj.name
    : selectedModel.replace(/-high|-medium|-low/g, "").replace(/-/g, " ");

  const displayMessages = fillHeight ? messages : messages.slice(-4);

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
    <div
      className={`relative flex flex-col w-full font-sans text-zinc-200 ${
        fillHeight ? "h-full flex-1 min-h-0" : ""
      } ${mobile ? "px-1 h-full flex-1 min-h-0" : ""}`}
    >
      {/* ── TOP ACTION BAR ── */}
      {mobile ? (
        <>
          {/* Row 1: Session picker, new session, refresh, pairing key (identical to OpenCode) */}
          <div className="flex shrink-0 items-center justify-between gap-2 py-0.5">
            <div className="relative flex min-w-0 items-center">
              <button
                type="button"
                onClick={() => {
                  if (mobileMenu !== "session") void refreshConversationHistory();
                  setMobileMenu(mobileMenu === "session" ? null : "session");
                }}
                className="ca-chip"
              >
                <span className="max-w-[160px] truncate">
                  {activeConversation ? activeConversation.title || t("Percakapan") : t("Pilih sesi")}
                </span>
                <CaretDown size={13} weight="bold" className="shrink-0 text-zinc-400" />
              </button>

              {mobileMenu === "session" && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMobileMenu(null)} />
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

                    {/* Quick New Session */}
                    <button
                      type="button"
                      onClick={() => {
                        startNewConversation();
                        setMobileMenu(null);
                      }}
                      className="mb-1 flex w-full items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-left text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                    >
                      <Plus size={11} weight="bold" />
                      <span>{t("Buat sesi baru")}</span>
                    </button>

                    {/* Session list */}
                    <div className="max-h-56 overflow-y-auto pr-0.5">
                      {isLoadingHistory ? (
                        <div className="px-2 py-4 text-center text-[11px] text-zinc-500">
                          {t("Memuat riwayat sesi...")}
                        </div>
                      ) : filteredConversations.length === 0 ? (
                        <div className="px-2 py-4 text-center text-[11px] text-zinc-500">
                          {t("Tidak ada percakapan ditemukan")}
                        </div>
                      ) : (
                        filteredConversations.map((c) => {
                          const isActive = c.id === chat.conversationId;
                          return (
                            <div
                              key={c.id}
                              onClick={() => {
                                void loadConversation(c.id);
                                setMobileMenu(null);
                                setSessionSearch("");
                              }}
                              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] transition-colors cursor-pointer ${
                                isActive ? "bg-white/[0.10] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.06]"
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate">{c.title || "Untitled Session"}</span>
                              {isActive && <Check size={12} weight="bold" className="text-emerald-400 shrink-0" />}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDeleteConversation(c.id);
                                }}
                                className="p-0.5 text-zinc-500 hover:text-red-400 rounded"
                                title={t("Hapus percakapan")}
                              >
                                <Trash size={11} weight="bold" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => startNewConversation()}
                className="ca-ib"
                title={t("Sesi baru")}
              >
                <Plus size={18} weight="bold" />
              </button>
              <button
                type="button"
                onClick={() => void refreshConversationHistory()}
                className="ca-ib"
                title={t("Segarkan")}
              >
                <ArrowsClockwise size={18} weight="bold" />
              </button>
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
            </div>
          </div>

          {/* Row 2: Model & Effort pickers (identical layout to OpenCode's Agent & Model row) */}
          <div className="relative flex shrink-0 items-center gap-2 mt-1.5 mb-1">
            <button
              type="button"
              onClick={() => setMobileMenu(mobileMenu === "model" ? null : "model")}
              className="ca-chip d"
              title={t("Pilih model Antigravity")}
            >
              <span className="max-w-[160px] truncate">{currentParsed.baseName}</span>
              <CaretDown size={13} weight="bold" className="shrink-0 text-zinc-600" />
            </button>

            <button
              type="button"
              onClick={() => setMobileMenu(mobileMenu === "effort" ? null : "effort")}
              className="ca-chip d"
              title={t("Effort")}
            >
              <span className="max-w-[100px] truncate">{currentParsed.effort}</span>
              <CaretDown size={13} weight="bold" className="shrink-0 text-zinc-600" />
            </button>

            {/* Model picker dropdown */}
            {mobileMenu === "model" && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMobileMenu(null)} />
                <div className="absolute left-0 top-7 z-50 max-h-64 w-[min(17rem,80vw)] overflow-y-auto rounded-xl border border-white/15 bg-[#16171d]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                  {groupedModels.map((g) => {
                    const isSelected = g.baseName === currentParsed.baseName;
                    return (
                      <button
                        key={g.baseName}
                        type="button"
                        onClick={() => {
                          const sameEffort = g.variants.find((v) => v.effort === currentParsed.effort);
                          setSelectedModel((sameEffort ?? g.variants[0]).model.id);
                          setMobileMenu(null);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] transition-colors ${
                          isSelected ? "bg-white/[0.10] text-zinc-100" : "text-zinc-300 hover:bg-white/[0.06]"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{g.baseName}</span>
                        {isSelected && <Check size={12} weight="bold" className="text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Effort picker dropdown */}
            {mobileMenu === "effort" && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMobileMenu(null)} />
                <div className="absolute left-24 top-7 z-50 max-h-64 w-[min(13rem,70vw)] overflow-y-auto rounded-xl border border-white/15 bg-[#16171d]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                  {(currentBaseGroup?.variants ?? []).map((v) => {
                    const isSelected = v.model.id === selectedModel;
                    return (
                      <button
                        key={v.model.id}
                        type="button"
                        onClick={() => {
                          setSelectedModel(v.model.id);
                          setMobileMenu(null);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] transition-colors ${
                          isSelected ? "bg-white/[0.10] text-zinc-100" : "text-zinc-300 hover:bg-white/[0.06]"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{v.effort}</span>
                        {isSelected && <Check size={12} weight="bold" className="text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      ) : (
      <div className="flex items-center justify-between py-1 mb-1 border-b border-white/[0.05] shrink-0">
        {/* Model Selector Dropdown Pill */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 text-[11px] font-medium text-zinc-300 transition-colors cursor-pointer"
            title={t("Pilih model Antigravity")}
          >
            {selectedModel.includes("flash") ? (
              <Lightning size={12} weight="fill" className="text-amber-400" />
            ) : (
              <Brain size={12} weight="fill" className="text-sky-400" />
            )}
            <span className="truncate max-w-[130px]">{currentModelLabel}</span>
            <CaretDown size={10} weight="bold" className="text-zinc-400" />
          </button>

          {/* Model Popover Menu */}
          {isModelMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsModelMenuOpen(false)}
              />
              <div className="absolute left-0 top-full mt-1.5 w-56 rounded-xl bg-[#16171d]/95 backdrop-blur-xl border border-white/15 p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                  {t("Model Antigravity")}
                </div>
                <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                  {availableModels.map((m) => {
                    const isSelected = m.id === selectedModel;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelectedModel(m.id);
                          setIsModelMenuOpen(false);
                        }}
                        className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left text-[11.5px] transition-colors ${
                          isSelected
                            ? "bg-white/15 text-white font-medium"
                            : "text-zinc-300 hover:bg-white/[0.08]"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {m.category === "fast" ? (
                            <Lightning size={12} weight="fill" className="text-amber-400 shrink-0" />
                          ) : (
                            <Brain size={12} weight="fill" className="text-sky-400 shrink-0" />
                          )}
                          <span className="truncate">{m.name}</span>
                        </div>
                        {isSelected && <Check size={12} weight="bold" className="text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* History 🕒, New Chat (+), Clear Chat (🗑️), and Optional Expand Toggle */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => toggleHistoryDrawer()}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border ${
              isHistoryOpen
                ? "bg-sky-500/20 border-sky-500/40 text-sky-300"
                : "bg-white/[0.06] hover:bg-white/[0.10] border-white/10 text-zinc-400 hover:text-zinc-200"
            }`}
            title={t("Riwayat Percakapan (AGY Desktop, IDE, CLI)")}
          >
            <ClockCounterClockwise size={13} weight="bold" />
            <span>{t("Riwayat")}</span>
          </button>

          <button
            type="button"
            onClick={() => startNewConversation()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            title={t("Sesi Baru (New Chat)")}
          >
            <Plus size={13} weight="bold" />
            <span>{t("Baru")}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (messages.length > 0 && window.confirm(t("Hapus semua pesan dalam sesi chat ini?"))) {
                clearChat();
              }
            }}
            disabled={messages.length === 0 && !streamingText}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.06] hover:bg-red-500/15 hover:border-red-500/35 hover:text-red-300 border border-white/10 text-[11px] font-medium text-zinc-400 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            title={t("Hapus Chat")}
          >
            <Trash size={13} weight="bold" />
            <span>{t("Hapus")}</span>
          </button>

          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              className={`flex items-center justify-center h-7 w-7 rounded-full border transition-all ${
                isExpanded
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                  : "bg-white/[0.06] hover:bg-white/[0.12] border-white/10 text-zinc-400 hover:text-zinc-200"
              }`}
              title={isExpanded ? t("Kembalikan Tampilan Normal") : t("Perluas Chat ke Layar Penuh")}
            >
              {isExpanded ? (
                <ArrowsInSimple size={13} weight="bold" />
              ) : (
                <ArrowsOutSimple size={13} weight="bold" />
              )}
            </button>
          )}
        </div>
      </div>
      )}

      {/* ── MESSAGES / STREAMING SCROLL AREA (Dynamically Fills Screen in fillHeight Mode) ── */}
      {displayMessages.length > 0 || isStreaming || streamingText ? (
        <div
          ref={messagesContainerRef}
          className={`relative flex flex-col gap-2.5 pr-1 mb-2 scrollbar-thin scrollbar-thumb-white/10 touch-pan-y overscroll-contain ${
            fillHeight
              ? "flex-1 min-h-0 overflow-y-auto"
              : "max-h-48 sm:max-h-64 min-h-[50px] overflow-y-auto"
          }`}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {displayMessages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${
                m.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-[12.5px] leading-relaxed select-text whitespace-pre-wrap break-words ${
                  mobile
                    ? m.role === "user"
                      ? "font-medium rounded-br-xs"
                      : "rounded-bl-xs shadow-sm"
                    : m.role === "user"
                      ? "bg-white/15 text-white font-medium rounded-br-xs"
                      : "bg-[#1c1d25] border border-white/10 text-zinc-200 rounded-bl-xs shadow-sm"
                }`}
                style={
                  mobile
                    ? m.role === "user"
                      ? { background: "var(--ab)", color: "var(--ac)" }
                      : { background: "var(--cd)", color: "var(--tx)", boxShadow: "inset 0 0 0 1px var(--ln)" }
                    : undefined
                }
              >
                {m.content}
              </div>
            </div>
          ))}

          {/* Streaming Assistant Delta */}
          {isStreaming && streamingText && (
            <div className="flex flex-col items-start animate-in fade-in duration-100">
              <div
                className={`max-w-[90%] rounded-2xl rounded-bl-xs px-3.5 py-2 text-[12.5px] leading-relaxed select-text shadow-sm whitespace-pre-wrap break-words ${
                  mobile ? "" : "bg-[#1c1d25] border border-sky-500/30 text-zinc-200"
                }`}
                style={
                  mobile
                    ? { background: "var(--cd)", color: "var(--tx)", boxShadow: "inset 0 0 0 1px var(--ac)" }
                    : undefined
                }
              >
                <span>{streamingText}</span>
                <span className="inline-block w-1.5 h-3.5 ml-1 bg-sky-400 animate-pulse align-middle" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      ) : fillHeight ? (
        mobile ? (
          <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
            <div className="ca-ei" style={{ marginTop: 18 }}>
              <ChatCircleDots size={26} weight="bold" />
            </div>
            <b className="ca-et">
              {chat.conversationId ? t("Sesi ini belum punya pesan.") : t("Pilih sesi")}
            </b>
            <p className="ca-ep">
              {t("Ketik instruksi untuk Antigravity atau paste screenshot…")}
            </p>
          </div>
        ) : (
        /* Helpful starter suggestions when chat has no messages yet */
        <div className="flex-1 flex flex-col items-center justify-center p-3 text-center my-auto min-h-[120px] animate-in fade-in duration-200">
          <div className="w-9 h-9 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-zinc-400 mb-2">
            <ChatCircleDots size={20} weight="duotone" />
          </div>
          <p className="text-[12px] font-semibold text-zinc-300 mb-0.5">
            {t("Antigravity Interactive Agent")}
          </p>
          <p className="text-[10.5px] text-zinc-500 max-w-[260px] mb-3">
            {t("Kirim instruksi coding, jalankan perintah bash, atau tanyakan struktur kode.")}
          </p>
          <div className="flex flex-wrap gap-1.5 justify-center max-w-[340px]">
            {[
              "git status -s",
              "Periksa perubahan terbaru",
              "Jelaskan alur aplikasi ini",
            ].map((promptText, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => void sendAgentChat(promptText)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.12] active:scale-95 border border-white/10 text-zinc-300 transition-all cursor-pointer"
              >
                {promptText}
              </button>
            ))}
          </div>
        </div>
        )
      ) : null}

      {/* ── ATTACHMENT PREVIEW CHIPS ── */}
      {attachments.length > 0 && (
        <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1">
          {attachments.map((att, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-[11.5px] text-zinc-300 shrink-0"
              style={
                mobile
                  ? { background: "var(--cd)", borderColor: "var(--ln)", color: "var(--tx)" }
                  : undefined
              }
            >
              {att.previewUrl ? (
                <img
                  src={att.previewUrl}
                  alt={att.name}
                  className="w-4 h-4 rounded object-cover"
                />
              ) : (
                <FileText size={13} weight="bold" className="text-zinc-400" />
              )}
              <span className="max-w-[130px] truncate">{att.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                className="text-zinc-400 hover:text-white p-0.5 rounded hover:bg-white/10"
              >
                <X size={11} weight="bold" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── CONNECTION NOTICE (If Antigravity is not connected) ── */}
      {!isHookInstalled && (
        <div
          className="mb-2 flex items-center justify-between rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-200"
          style={
            mobile
              ? { background: "var(--amb)", color: "var(--amt)", borderColor: "var(--ln)" }
              : undefined
          }
        >
          <span>{t("Antigravity tidak terbuka atau belum terhubung.")}</span>
          <button
            type="button"
            onClick={() => void toggleHooks(true)}
            className="rounded-lg bg-amber-500/20 px-2.5 py-1 text-[10.5px] font-semibold text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 cursor-pointer"
            style={
              mobile
                ? { background: "#FF9F0A", color: "#171A26", border: "0" }
                : undefined
            }
          >
            {t("Hubungkan")}
          </button>
        </div>
      )}

      {/* ── CHAT INPUT FORM (With Paste & Attach) ── */}
      {mobile ? (
        <div className={`ca-cp mt-auto shrink-0 ${!isHookInstalled ? "opacity-60" : ""}`}>
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
            disabled={!isHookInstalled || isUploading}
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
                : t("Ketik instruksi coding atau paste screenshot...")
            }
            onPaste={handlePaste}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="max-h-[96px] min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[14.5px] outline-none [scrollbar-width:none] disabled:cursor-not-allowed"
            style={{ color: "var(--tx)" }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!isHookInstalled || (!draft.trim() && attachments.length === 0)}
            className={`ca-sd ${!isHookInstalled || (!draft.trim() && attachments.length === 0) ? "d" : ""}`}
            aria-label="Send"
          >
            <ArrowUp size={18} weight="bold" />
          </button>
        </div>
      ) : (
      <div className={`relative flex items-end gap-1.5 rounded-2xl bg-white/[0.07] border border-white/10 p-2 focus-within:border-white/30 transition-colors ${!isHookInstalled ? "opacity-60" : ""}`}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Paperclip Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!isHookInstalled || isUploading}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-white/10 transition-colors disabled:pointer-events-none disabled:opacity-40"
          title={t("Lampirkan file atau screenshot (bisa Ctrl+V)")}
        >
          <Paperclip size={16} weight="bold" className={isUploading ? "animate-spin" : ""} />
        </button>

        {/* Auto-growing Textarea */}
        <textarea
          ref={textareaRef}
          value={draft}
          rows={1}
          disabled={!isHookInstalled || isStreaming}
          placeholder={
            !isHookInstalled
              ? t("Antigravity tidak terbuka atau belum terhubung")
              : t("Ketik instruksi coding atau paste screenshot...")
          }
          onPaste={handlePaste}
          onChange={(e) => {
            setDraft(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 110)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="max-h-[110px] min-h-[26px] flex-1 resize-none bg-transparent py-1 text-[13px] text-white placeholder-zinc-500 outline-none [scrollbar-width:none] disabled:cursor-not-allowed"
        />

        {/* Send Button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!isHookInstalled || (!draft.trim() && attachments.length === 0)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black hover:bg-zinc-200 disabled:opacity-20 disabled:pointer-events-none transition-all shadow-sm cursor-pointer"
        >
          <ArrowUp size={15} weight="bold" />
        </button>
      </div>
      )}

      {/* ── HISTORY DRAWER (Responsive Modal / Bottom Sheet) ── */}
      {isHistoryOpen && (
        <div
          className="absolute inset-0 z-50 bg-[#101116]/98 backdrop-blur-xl border border-white/15 rounded-2xl p-3 sm:p-4 flex flex-col shadow-2xl animate-in fade-in duration-150 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400">
                <ClockCounterClockwise size={16} weight="bold" />
              </div>
              <div>
                <h4 className="text-[13px] font-bold text-white leading-tight">
                  {t("Riwayat Percakapan")}
                </h4>
                <p className="text-[10.5px] text-zinc-400">
                  {t("Tersinkronisasi otomatis dari Desktop, IDE & CLI")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggleHistoryDrawer(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
            >
              <X size={15} weight="bold" />
            </button>
          </div>

          {/* Search Box with responsive styling */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.07] border border-white/12 mb-2.5 focus-within:border-sky-500/60 transition-colors shrink-0">
            <MagnifyingGlass size={15} weight="bold" className="text-zinc-400 shrink-0" />
            <input
              type="text"
              value={historyQuery}
              placeholder={t("Cari percakapan, topik, atau folder project...")}
              onChange={(e) => void refreshConversationHistory(e.target.value)}
              autoFocus
              className="w-full bg-transparent text-[12.5px] text-white placeholder-zinc-500 outline-none"
            />
            {historyQuery && (
              <button
                type="button"
                onClick={() => void refreshConversationHistory("")}
                className="text-zinc-400 hover:text-white p-0.5 rounded"
              >
                <X size={13} weight="bold" />
              </button>
            )}
          </div>

          {/* History List */}
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pr-1 scrollbar-thin scrollbar-thumb-white/15">
              {isLoadingHistory ? (
                <div className="flex flex-col items-center justify-center py-16 text-[12px] text-zinc-400 gap-2.5">
                  <div className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                  <span>{t("Memuat riwayat sesi...")}</span>
                </div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-500 px-4">
                  <ClockCounterClockwise size={32} weight="thin" className="text-zinc-600 mb-2.5" />
                  <p className="text-[13px] font-medium text-zinc-300">{t("Tidak ada percakapan ditemukan")}</p>
                  <p className="text-[11.5px] text-zinc-500 mt-1 max-w-[280px]">
                    {t("Sesi percakapan dari Antigravity CLI, IDE, dan Desktop akan otomatis muncul di sini.")}
                  </p>
                </div>
              ) : (
                conversations.map((c) => {
                  const isActive = c.id === chat.conversationId;
                  const openConversation = () => {
                    void loadConversation(c.id);
                    toggleHistoryDrawer(false);
                  };
                  return (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      onClick={openConversation}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openConversation();
                        }
                      }}
                      className={`group flex flex-col text-left px-3.5 py-3 rounded-2xl border transition-all cursor-pointer ${
                        isActive
                          ? "bg-sky-500/15 border-sky-500/40 text-white shadow-sm"
                          : "bg-white/[0.03] hover:bg-white/[0.08] active:bg-white/[0.12] border-white/5 text-zinc-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-[13px] text-zinc-100 truncate max-w-[280px] sm:max-w-[360px]">
                          {c.title || "Untitled Session"}
                        </span>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <span className="text-[10.5px] text-zinc-500 font-mono">
                            {c.lastModified.split(" ")[0]}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteConversation(c.id);
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 hover:text-red-300 hover:bg-red-500/15 transition-colors"
                            title={t("Hapus percakapan")}
                          >
                            <Trash size={13} weight="bold" />
                          </button>
                        </div>
                      </div>
                      {c.preview && (
                        <p className="text-[11.5px] text-zinc-400 line-clamp-2 leading-relaxed">
                          {c.preview}
                        </p>
                      )}
                      {c.workspace && (
                        <div className="mt-2 flex items-center gap-1 text-[10px] text-zinc-500 font-mono">
                          <span className="inline-flex items-center gap-1.5 truncate max-w-[340px] bg-white/[0.05] px-2 py-0.5 rounded-md border border-white/5">
                            <FolderSimple size={11} weight="bold" className="shrink-0" />
                            <span className="truncate">{c.workspace}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
    </div>
  );
}
