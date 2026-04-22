"use client";

import { useEffect, useMemo, useState } from "react";
import { createMeditation } from "@/lib/api/meditations";
import { getSoundFiles } from "@/lib/api/sounds";
import Toast from "@/components/Toast";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setMeditations } from "@/store/features/meditationSlice";
import { showLoading, hideLoading } from "@/store/features/uiSlice";
import { getAllMeditations } from "@/lib/api/meditations";
import {
  validateMeditationTitle,
  validatePauseDuration,
  validateSpeed,
} from "@/lib/utils/validation";
import ModalConfirmCreateMeditation from "@/components/modals/ModalConfirmCreateMeditation";

export default function CreateMeditationForm() {
  const dispatch = useAppDispatch();
  const { isAuthenticated, accessToken } = useAppSelector(
    (state) => state.auth,
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [errors, setErrors] = useState<{
    title?: string;
    description?: string;
  }>({});
  type Row = {
    id: number;
    type: "text" | "pause" | "sound";
    text: string;
    speed: string;
    pauseDuration: string;
    soundFile: string;
  };
  type RowError = {
    text?: string;
    speed?: string;
    pauseDuration?: string;
    soundFile?: string;
  };

  const [rows, setRows] = useState<Row[]>([]);
  const [rowErrors, setRowErrors] = useState<Record<number, RowError>>({});
  const [soundFiles, setSoundFiles] = useState<
    Array<{ name: string; filename: string }>
  >([]);
  const [soundsLoading, setSoundsLoading] = useState(false);
  const [soundsError, setSoundsError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeRowMenu, setActiveRowMenu] = useState<number | null>(null);
  const maxDescriptionLength = 300;

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchSounds = async () => {
      setSoundsLoading(true);
      setSoundsError(null);
      try {
        const response = await getSoundFiles();
        setSoundFiles(
          response.soundFiles.map((sound) => ({
            name: sound.name,
            filename: sound.filename,
          })),
        );
      } catch (err: any) {
        const message =
          err?.response?.data?.error?.message || "Unable to load sound files.";
        setSoundsError(message);
      } finally {
        setSoundsLoading(false);
      }
    };

    fetchSounds();
  }, [isAuthenticated]);

  const handleToggle = () => {
    setIsExpanded((prev) => {
      const nextValue = !prev;
      if (nextValue && rows.length === 0) {
        setRows([
          {
            id: 1,
            type: "text",
            text: "",
            speed: "",
            pauseDuration: "",
            soundFile: "",
          },
        ]);
      }
      return nextValue;
    });
  };

  const handleAddRow = () => {
    setRows((prev) => {
      const nextId = prev.length + 1;
      return [
        ...prev,
        {
          id: nextId,
          type: "text",
          text: "",
          speed: "",
          pauseDuration: "",
          soundFile: "",
        },
      ];
    });
  };

  const handleDeleteRow = (id: number) => {
    setRows((prev) =>
      prev
        .filter((row) => row.id !== id)
        .map((row, index) => ({ ...row, id: index + 1 })),
    );
    setRowErrors({});
  };

  const moveRow = (id: number, direction: "up" | "down") => {
    setRows((prev) => {
      const index = prev.findIndex((row) => row.id === id);
      if (index < 0) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const nextRows = [...prev];
      const [moved] = nextRows.splice(index, 1);
      nextRows.splice(targetIndex, 0, moved);
      return nextRows.map((row, rowIndex) => ({ ...row, id: rowIndex + 1 }));
    });
    setRowErrors({});
  };

  const updateRow = (id: number, updates: Partial<Row>) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...updates } : row)),
    );
  };

  const clearRowError = (id: number, field: keyof RowError) => {
    setRowErrors((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: undefined,
      },
    }));
  };

  const submitEnabled = useMemo(
    () => !isSubmitting && rows.length > 0,
    [isSubmitting, rows.length],
  );

  const handleOpenModal = () => {
    // Validate rows before opening modal
    const nextRowErrors: typeof rowErrors = {};
    rows.forEach((row) => {
      const rowError: RowError = {};
      if (row.type === "text") {
        if (!row.text.trim()) {
          rowError.text = "Text is required";
        }
        if (row.speed.trim()) {
          const speedValidation = validateSpeed(row.speed);
          if (!speedValidation.valid) {
            rowError.speed = speedValidation.message;
          }
        }
      }

      if (row.type === "pause") {
        const pauseValidation = validatePauseDuration(row.pauseDuration);
        if (!pauseValidation.valid) {
          rowError.pauseDuration = pauseValidation.message;
        }
      }

      if (row.type === "sound") {
        if (!row.soundFile) {
          rowError.soundFile = "Select a sound file";
        }
      }

      if (Object.keys(rowError).length > 0) {
        nextRowErrors[row.id] = rowError;
      }
    });
    setRowErrors(nextRowErrors);

    // Only open modal if no row errors
    if (Object.keys(nextRowErrors).length === 0) {
      setIsModalOpen(true);
    }
  };

  const handleSubmit = async () => {
    // Validate title and description
    const titleValidation = validateMeditationTitle(title);
    const nextErrors: { title?: string; description?: string } = {};
    if (!titleValidation.valid) {
      nextErrors.title = titleValidation.message;
    }
    if (description.length > maxDescriptionLength) {
      nextErrors.description = `Description must be ${maxDescriptionLength} characters or less`;
    }
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    dispatch(showLoading("Creating your meditation..."));
    try {
      await createMeditation({
        title: title.trim(),
        description: description.trim() || undefined,
        visibility,
        meditationArray: rows.map((row) => {
          if (row.type === "text") {
            return {
              id: row.id,
              text: row.text.trim(),
              speed: row.speed.trim() || undefined,
            };
          }

          if (row.type === "pause") {
            return {
              id: row.id,
              pause_duration: row.pauseDuration.trim(),
            };
          }

          return {
            id: row.id,
            sound_file: row.soundFile,
          };
        }),
      });

      const refresh = await getAllMeditations(accessToken);
      dispatch(setMeditations(refresh.meditations ?? []));
      setToast({
        message: "Meditation submitted successfully.",
        variant: "success",
      });
      setTitle("");
      setDescription("");
      setVisibility("public");
      setRows([]);
      setRowErrors({});
      setIsExpanded(false);
      setIsModalOpen(false);
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message || "Unable to submit meditation.";
      setToast({ message, variant: "error" });
    } finally {
      setIsSubmitting(false);
      dispatch(hideLoading());
    }
  };

  const handleTitleBlur = () => {
    const result = validateMeditationTitle(title);
    if (!result.valid) {
      setErrors((prev) => ({ ...prev, title: result.message }));
    }
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (errors.title) {
      setErrors((prev) => ({ ...prev, title: undefined }));
    }
  };

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    if (value.length > maxDescriptionLength) {
      setErrors((prev) => ({
        ...prev,
        description: `Description must be ${maxDescriptionLength} characters or less`,
      }));
    } else if (errors.description) {
      setErrors((prev) => ({ ...prev, description: undefined }));
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isSubmitting}
        className="flex w-full items-center justify-between rounded-2xl border border-calm-200/70 bg-white/80 px-4 py-3 text-left shadow-sm transition hover:border-primary-200"
        aria-expanded={isExpanded}
      >
        <div>
          <h2 className="text-xl font-display font-semibold text-calm-900">
            Create New Meditation
          </h2>
          <p className="text-sm text-calm-500">
            Build a custom meditation sequence
          </p>
        </div>
        <span className="text-calm-500">
          {isExpanded ? (
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 15l7-7 7 7"
              />
            </svg>
          ) : (
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          )}
        </span>
      </button>

      {isExpanded && (
        <div className="rounded-3xl border border-dashed border-calm-200 bg-white/70 p-6 shadow-sm">
          <div>
            <h3 className="text-lg font-display font-semibold text-calm-900 mb-4">
              Meditation Rows
            </h3>

            {soundsError && (
              <p className="mt-2 text-xs text-red-500">{soundsError}</p>
            )}

            {rows.length > 0 ? (
              <div className="mt-4 space-y-2">
                {/* Header Row */}
                <div className="grid grid-cols-[2.5rem_5rem_1fr_3rem_3rem_8rem] gap-2 px-2 pb-2 border-b border-calm-200">
                  <div className="text-xs font-semibold text-calm-600">#</div>
                  <div className="text-xs font-semibold text-calm-600">
                    Type
                  </div>
                  <div className="text-xs font-semibold text-calm-600">
                    Text
                  </div>
                  <div className="text-xs font-semibold text-calm-600">
                    Speed
                  </div>
                  <div className="text-xs font-semibold text-calm-600">
                    Pause
                  </div>
                  <div className="text-xs font-semibold text-calm-600">
                    Sound File
                  </div>
                </div>

                {/* Data Rows */}
                {rows.map((row, index) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[2.5rem_5rem_1fr_3rem_3rem_8rem] gap-2 items-start relative"
                  >
                    {/* Row Number - Clickable */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveRowMenu(
                            activeRowMenu === row.id ? null : row.id,
                          )
                        }
                        disabled={isSubmitting}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-calm-400 text-xs font-semibold text-white transition hover:bg-calm-500 disabled:cursor-not-allowed"
                      >
                        {row.id}
                      </button>

                      {/* Actions Popup */}
                      {activeRowMenu === row.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setActiveRowMenu(null)}
                          />
                          <div className="absolute top-8 left-0 z-20 bg-white border border-calm-300 rounded-lg shadow-lg py-1 min-w-[9rem]">
                            <button
                              type="button"
                              onClick={() => {
                                moveRow(row.id, "up");
                                setActiveRowMenu(null);
                              }}
                              disabled={index === 0}
                              className="w-full px-3 py-2 text-left text-xs text-calm-700 hover:bg-calm-50 disabled:text-calm-300 disabled:cursor-not-allowed"
                            >
                              Move Up
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                moveRow(row.id, "down");
                                setActiveRowMenu(null);
                              }}
                              disabled={index === rows.length - 1}
                              className="w-full px-3 py-2 text-left text-xs text-calm-700 hover:bg-calm-50 disabled:text-calm-300 disabled:cursor-not-allowed"
                            >
                              Move Down
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleDeleteRow(row.id);
                                setActiveRowMenu(null);
                              }}
                              className="w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"
                            >
                              Delete Row
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Type Select */}
                    <select
                      value={row.type}
                      onChange={(event) => {
                        updateRow(row.id, {
                          type: event.target.value as
                            | "text"
                            | "pause"
                            | "sound",
                          text: "",
                          speed: "",
                          pauseDuration: "",
                          soundFile: "",
                        });
                        setRowErrors((prev) => ({
                          ...prev,
                          [row.id]: {},
                        }));
                      }}
                      disabled={isSubmitting}
                      className="rounded border border-calm-200 bg-white px-2 py-1 text-xs text-calm-700 outline-none focus:border-primary-300 focus:ring-1 focus:ring-primary-100"
                    >
                      <option value="text">Text</option>
                      <option value="pause">Pause</option>
                      <option value="sound">Sound File</option>
                    </select>

                    {/* Text Column */}
                    <div className="flex flex-col">
                      <textarea
                        rows={2}
                        value={row.text}
                        onChange={(event) => {
                          updateRow(row.id, { text: event.target.value });
                          if (rowErrors[row.id]?.text) {
                            clearRowError(row.id, "text");
                          }
                        }}
                        disabled={row.type !== "text" || isSubmitting}
                        className={`w-full rounded border px-2 py-1 text-xs text-calm-900 outline-none transition focus:border-primary-300 focus:ring-1 focus:ring-primary-100 disabled:bg-calm-50 disabled:text-calm-400 disabled:cursor-not-allowed ${
                          rowErrors[row.id]?.text
                            ? "border-red-300"
                            : "border-calm-200"
                        }`}
                        placeholder={
                          row.type === "text"
                            ? "Begin with a calming phrase..."
                            : ""
                        }
                      />
                      {rowErrors[row.id]?.text && (
                        <p className="mt-1 text-xs text-red-500">
                          {rowErrors[row.id]?.text}
                        </p>
                      )}
                    </div>

                    {/* Speed Column */}
                    <div className="flex flex-col">
                      <input
                        type="number"
                        step="0.1"
                        min="0.7"
                        max="1.3"
                        value={row.speed}
                        onChange={(event) => {
                          updateRow(row.id, { speed: event.target.value });
                          if (rowErrors[row.id]?.speed) {
                            clearRowError(row.id, "speed");
                          }
                        }}
                        disabled={row.type !== "text" || isSubmitting}
                        className={`w-full rounded border px-1 py-1 text-xs text-calm-900 outline-none transition focus:border-primary-300 focus:ring-1 focus:ring-primary-100 disabled:bg-calm-50 disabled:text-calm-400 disabled:cursor-not-allowed ${
                          rowErrors[row.id]?.speed
                            ? "border-red-300"
                            : "border-calm-200"
                        }`}
                        placeholder="1.0"
                      />
                      {rowErrors[row.id]?.speed && (
                        <p className="mt-1 text-xs text-red-500">
                          {rowErrors[row.id]?.speed}
                        </p>
                      )}
                    </div>

                    {/* Pause Column */}
                    <div className="flex flex-col">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={row.pauseDuration}
                        onChange={(event) => {
                          updateRow(row.id, {
                            pauseDuration: event.target.value,
                          });
                          if (rowErrors[row.id]?.pauseDuration) {
                            clearRowError(row.id, "pauseDuration");
                          }
                        }}
                        disabled={row.type !== "pause" || isSubmitting}
                        className={`w-full rounded border px-1 py-1 text-xs text-calm-900 outline-none transition focus:border-primary-300 focus:ring-1 focus:ring-primary-100 disabled:bg-calm-50 disabled:text-calm-400 disabled:cursor-not-allowed ${
                          rowErrors[row.id]?.pauseDuration
                            ? "border-red-300"
                            : "border-calm-200"
                        }`}
                        placeholder="5"
                      />
                      {rowErrors[row.id]?.pauseDuration && (
                        <p className="mt-1 text-xs text-red-500">
                          {rowErrors[row.id]?.pauseDuration}
                        </p>
                      )}
                    </div>

                    {/* Sound File Column */}
                    <div className="flex flex-col">
                      <select
                        value={row.soundFile}
                        onChange={(event) => {
                          updateRow(row.id, { soundFile: event.target.value });
                          if (rowErrors[row.id]?.soundFile) {
                            clearRowError(row.id, "soundFile");
                          }
                        }}
                        disabled={
                          row.type !== "sound" || soundsLoading || isSubmitting
                        }
                        className={`w-full rounded border px-2 py-1 text-xs text-calm-900 outline-none transition focus:border-primary-300 focus:ring-1 focus:ring-primary-100 disabled:bg-calm-50 disabled:text-calm-400 disabled:cursor-not-allowed ${
                          rowErrors[row.id]?.soundFile
                            ? "border-red-300"
                            : "border-calm-200"
                        }`}
                      >
                        <option value="">
                          {soundsLoading ? "Loading..." : "Select..."}
                        </option>
                        {soundFiles.map((sound) => (
                          <option key={sound.filename} value={sound.filename}>
                            {sound.name}
                          </option>
                        ))}
                      </select>
                      {rowErrors[row.id]?.soundFile && (
                        <p className="mt-1 text-xs text-red-500">
                          {rowErrors[row.id]?.soundFile}
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                {/* Add Row Button - Aligned to right of Sound File column */}
                <div className="grid grid-cols-[2.5rem_5rem_1fr_3rem_3rem_8rem] gap-2 items-start">
                  <div className="col-start-6 flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddRow}
                      disabled={isSubmitting}
                      className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-calm-300 bg-green-500 text-white transition hover:bg-green-600 hover:border-calm-400 disabled:cursor-not-allowed disabled:bg-green-300"
                    >
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 5v14m-7-7h14"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-calm-500">
                  Add a row to begin building your sequence.
                </p>
                <button
                  type="button"
                  onClick={handleAddRow}
                  disabled={isSubmitting}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-calm-300 bg-green-500 text-white transition hover:bg-green-600 hover:border-calm-400 disabled:cursor-not-allowed disabled:bg-green-300"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 5v14m-7-7h14"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>

          <div className="mt-8 flex items-center justify-end">
            <button
              type="button"
              onClick={handleOpenModal}
              disabled={!submitEnabled}
              className="rounded-full bg-primary-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-primary-200"
            >
              Submit
            </button>
          </div>
        </div>
      )}

      <ModalConfirmCreateMeditation
        isOpen={isModalOpen}
        rows={rows}
        soundFiles={soundFiles}
        title={title}
        description={description}
        visibility={visibility}
        errors={errors}
        isSubmitting={isSubmitting}
        maxDescriptionLength={maxDescriptionLength}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleSubmit}
        onTitleChange={handleTitleChange}
        onDescriptionChange={handleDescriptionChange}
        onVisibilityChange={setVisibility}
        onTitleBlur={handleTitleBlur}
      />

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
