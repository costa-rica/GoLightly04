"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  DESCRIPTION_MAX,
  parseMeditationScript,
  type ScriptParseError,
} from "@golightly/shared-types";
import Toast from "@/components/Toast";
import { createMeditationScript, getAllMeditations } from "@/lib/api/meditations";
import { getSoundFiles, type SoundFile } from "@/lib/api/sounds";
import { validateMeditationTitle } from "@/lib/utils/validation";
import { hideLoading, showLoading } from "@/store/features/uiSlice";
import { setMeditations } from "@/store/features/meditationSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

type HighlightToken =
  | { type: "text"; value: string; start: number; inSpeed: boolean }
  | { type: "break" | "sound" | "speed"; value: string; start: number; knownSound?: boolean };

function getSoundTokens(script: string) {
  const matches = script.matchAll(/\[([^\]\n]+)\]/g);
  return Array.from(matches, (match) => match[1].trim());
}

function tokenizeForHighlight(script: string, soundMap: Map<string, SoundFile>, soundsLoading: boolean) {
  const tokens: HighlightToken[] = [];
  const speedRanges: Array<{ start: number; end: number }> = [];
  const speedStack: number[] = [];
  const tokenPattern = /<break\s+time="[^"]*"\s*\/?>|\[[^\]\n]*\]|\{speed=[^}]*\}|\{\/speed\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(script)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: "text",
        value: script.slice(lastIndex, match.index),
        start: lastIndex,
        inSpeed: speedStack.length > 0,
      });
    }

    const value = match[0];
    if (value.startsWith("{speed=")) {
      speedStack.push(match.index + value.length);
      tokens.push({ type: "speed", value, start: match.index });
    } else if (value === "{/speed}") {
      const start = speedStack.pop();
      if (start !== undefined) {
        speedRanges.push({ start, end: match.index });
      }
      tokens.push({ type: "speed", value, start: match.index });
    } else if (value.startsWith("[")) {
      const soundName = value.slice(1, -1).trim().toLowerCase();
      tokens.push({
        type: "sound",
        value,
        start: match.index,
        knownSound: soundsLoading ? undefined : soundMap.has(soundName),
      });
    } else {
      tokens.push({ type: "break", value, start: match.index });
    }

    lastIndex = match.index + value.length;
  }

  if (lastIndex < script.length) {
    tokens.push({
      type: "text",
      value: script.slice(lastIndex),
      start: lastIndex,
      inSpeed: speedStack.length > 0,
    });
  }

  return { tokens, speedRanges };
}

function tokenClass(token: HighlightToken, hasError: boolean) {
  if (hasError) {
    return "bg-red-50 text-red-700 underline decoration-red-500 decoration-2";
  }

  if (token.type === "break") {
    return "rounded bg-primary-50 px-1 font-mono text-primary-600";
  }

  if (token.type === "sound") {
    if (token.knownSound === undefined) {
      return "font-mono text-calm-600 underline decoration-dashed";
    }
    return token.knownSound
      ? "rounded bg-emerald-50 px-1 font-mono text-emerald-700"
      : "rounded bg-red-50 px-1 font-mono text-red-700";
  }

  if (token.type === "speed") {
    return "font-mono text-amber-700";
  }

  if (token.type === "text") {
    return token.inSpeed ? "italic text-calm-900" : "text-calm-900";
  }

  return "text-calm-900";
}

export default function ScriptMeditationEditor() {
  const dispatch = useAppDispatch();
  const { isAuthenticated, accessToken } = useAppSelector((state) => state.auth);
  const [isExpanded, setIsExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [script, setScript] = useState("");
  const [soundFiles, setSoundFiles] = useState<SoundFile[]>([]);
  const [soundsLoading, setSoundsLoading] = useState(false);
  const [soundsError, setSoundsError] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<ScriptParseError[]>([]);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [descriptionError, setDescriptionError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    setSoundsLoading(true);
    setSoundsError(null);
    getSoundFiles()
      .then((response) => setSoundFiles(response.soundFiles))
      .catch((error: any) => {
        setSoundsError(error?.response?.data?.error?.message || "Unable to load sound files.");
      })
      .finally(() => setSoundsLoading(false));
  }, [isAuthenticated]);

  const soundMap = useMemo(
    () => new Map(soundFiles.map((sound) => [sound.name.trim().toLowerCase(), sound])),
    [soundFiles],
  );
  const bracketSoundNames = useMemo(() => getSoundTokens(script), [script]);
  const hasPendingSoundValidation = soundsLoading && bracketSoundNames.length > 0;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const result = parseMeditationScript(script, (name) => {
        if (soundsLoading) {
          return { filename: "__pending__.mp3" };
        }
        return soundMap.get(name.trim().toLowerCase()) ?? null;
      });
      setParseErrors(result.ok ? [] : result.errors);
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [script, soundMap, soundsLoading]);

  const highlighted = useMemo(
    () => tokenizeForHighlight(script || " ", soundMap, soundsLoading),
    [script, soundMap, soundsLoading],
  );

  const submitDisabled =
    isSubmitting ||
    !title.trim() ||
    !script.trim() ||
    parseErrors.length > 0 ||
    hasPendingSoundValidation ||
    !!descriptionError;

  const handleScroll = () => {
    if (!textareaRef.current || !preRef.current) return;
    preRef.current.scrollTop = textareaRef.current.scrollTop;
    preRef.current.scrollLeft = textareaRef.current.scrollLeft;
  };

  const insertSound = (soundName: string) => {
    const textarea = textareaRef.current;
    const insertText = `[${soundName}]`;
    const start = textarea?.selectionStart ?? script.length;
    const end = textarea?.selectionEnd ?? script.length;
    setScript(`${script.slice(0, start)}${insertText}${script.slice(end)}`);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      const cursor = start + insertText.length;
      textarea?.setSelectionRange(cursor, cursor);
    });
  };

  const handleSubmit = async () => {
    const titleValidation = validateMeditationTitle(title);
    setTitleError(titleValidation.valid ? undefined : titleValidation.message);
    if (!titleValidation.valid || submitDisabled) {
      return;
    }

    setIsSubmitting(true);
    dispatch(showLoading("Creating your meditation..."));
    try {
      await createMeditationScript({
        title: title.trim(),
        description: description.trim() || undefined,
        visibility,
        script,
      });
      const refresh = await getAllMeditations(accessToken);
      dispatch(setMeditations(refresh.meditations ?? []));
      setToast({ message: "Meditation submitted successfully.", variant: "success" });
      setTitle("");
      setDescription("");
      setVisibility("public");
      setScript("");
      setParseErrors([]);
      setIsExpanded(false);
    } catch (error: any) {
      const details = error?.response?.data?.error?.details;
      if (Array.isArray(details)) {
        setParseErrors(details);
      }
      setToast({
        message: error?.response?.data?.error?.message || "Unable to submit meditation.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
      dispatch(hideLoading());
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={() => setIsExpanded((value) => !value)}
        disabled={isSubmitting}
        className="flex w-full items-center justify-between rounded-2xl border border-calm-200/70 bg-white/80 px-4 py-3 text-left shadow-sm transition hover:border-primary-200"
        aria-expanded={isExpanded}
      >
        <div>
          <h2 className="font-display text-xl font-semibold text-calm-900">Create New Meditation</h2>
          <p className="text-sm text-calm-500">Write a guided script with pauses and sounds</p>
        </div>
        <span className="text-calm-500">{isExpanded ? "Collapse" : "Expand"}</span>
      </button>

      {isExpanded && (
        <div className="grid gap-5 rounded-2xl border border-calm-200/70 bg-white/90 p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_10rem]">
              <label className="block">
                <span className="text-sm font-medium text-calm-700">Title</span>
                <input
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    if (titleError) setTitleError(undefined);
                  }}
                  className="mt-1 w-full rounded-xl border border-calm-200 px-3 py-2 text-sm outline-none transition focus:border-primary-400"
                  placeholder="Morning reset"
                />
                {titleError && <span className="mt-1 block text-xs text-red-600">{titleError}</span>}
              </label>
              <label className="block">
                <span className="text-sm font-medium text-calm-700">Visibility</span>
                <select
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value as "public" | "private")}
                  className="mt-1 w-full rounded-xl border border-calm-200 px-3 py-2 text-sm outline-none transition focus:border-primary-400"
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-calm-700">Description</span>
              <textarea
                value={description}
                onChange={(event) => {
                  const value = event.target.value;
                  setDescription(value);
                  setDescriptionError(
                    value.length > DESCRIPTION_MAX
                      ? `Description must be ${DESCRIPTION_MAX} characters or less`
                      : undefined,
                  );
                }}
                rows={2}
                className="mt-1 w-full resize-none rounded-xl border border-calm-200 px-3 py-2 text-sm outline-none transition focus:border-primary-400"
              />
              {descriptionError && <span className="mt-1 block text-xs text-red-600">{descriptionError}</span>}
            </label>

            <div>
              <span className="text-sm font-medium text-calm-700">Script</span>
              <div className="relative mt-1 min-h-72 overflow-hidden rounded-xl border border-calm-200 bg-white text-sm leading-6 focus-within:border-primary-400">
                <pre
                  ref={preRef}
                  aria-hidden
                  className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words p-4 font-sans text-sm leading-6"
                >
                  {highlighted.tokens.map((token, index) => {
                    const hasError = parseErrors.some((error) => error.index === token.start);
                    return (
                      <Fragment key={`${token.start}-${index}`}>
                        <span className={tokenClass(token, hasError)}>{token.value}</span>
                      </Fragment>
                    );
                  })}
                </pre>
                <textarea
                  ref={textareaRef}
                  value={script}
                  onChange={(event) => setScript(event.target.value)}
                  onScroll={handleScroll}
                  rows={12}
                  spellCheck
                  className="relative z-10 min-h-72 w-full resize-y bg-transparent p-4 font-sans text-sm leading-6 text-transparent caret-calm-900 outline-none selection:bg-primary-100"
                  placeholder={'Welcome. Close your eyes.\n<break time="2s" />\n[Tibetan Singing Bowl]'}
                />
              </div>
              <div className="mt-2 min-h-5 space-y-1 text-xs">
                {hasPendingSoundValidation && <p className="text-calm-500">Validating sounds...</p>}
                {parseErrors.map((error) => (
                  <p key={`${error.index}-${error.message}`} className="text-red-600">
                    Index {error.index}: {error.message}
                  </p>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitDisabled}
              className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-calm-300"
            >
              {hasPendingSoundValidation ? "Validating sounds..." : isSubmitting ? "Submitting..." : "Submit meditation"}
            </button>
          </div>

          <aside className="space-y-3 border-t border-calm-100 pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <h3 className="text-sm font-medium text-calm-800">Sounds</h3>
            {soundsError && <p className="text-xs text-red-600">{soundsError}</p>}
            <div className="max-h-72 space-y-2 overflow-auto pr-1">
              {soundsLoading && <p className="text-xs text-calm-500">Loading sounds...</p>}
              {!soundsLoading &&
                soundFiles.map((sound) => (
                  <button
                    key={sound.id}
                    type="button"
                    onClick={() => insertSound(sound.name)}
                    className="block w-full rounded-lg border border-calm-200 px-3 py-2 text-left text-sm text-calm-700 transition hover:border-emerald-200 hover:bg-emerald-50"
                  >
                    {sound.name}
                  </button>
                ))}
            </div>
          </aside>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
    </section>
  );
}
