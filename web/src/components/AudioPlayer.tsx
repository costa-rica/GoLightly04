"use client";

import { useEffect, useRef, useState } from "react";
import {
  downloadMeditation,
  getStreamToken,
  getStreamUrl,
} from "@/lib/api/meditations";
import { useAppSelector } from "@/store/hooks";

type AudioPlayerProps = {
  meditationId: number;
  title: string;
};

export default function AudioPlayer({ meditationId, title }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { accessToken, isAuthenticated } = useAppSelector(
    (state) => state.auth,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    const handleError = () => {
      setIsPlaying(false);
      setIsLoading(false);
      setError("Playback error. Please try again.");
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  const handleToggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    setError(null);

    if (isPlaying) {
      audio.pause();
      return;
    }

    try {
      setIsLoading(true);
      if (isAuthenticated && accessToken) {
        const { token } = await getStreamToken(meditationId);
        audio.src = `${getStreamUrl(meditationId)}?token=${encodeURIComponent(token)}`;
      } else {
        audio.src = getStreamUrl(meditationId);
      }
      await audio.play();
    } catch (err: any) {
      setError(err?.message || "Playback error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    setError(null);
    setIsDownloading(true);

    try {
      await downloadMeditation(meditationId, title);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        setError("Please log in to download this meditation.");
      } else if (status === 403) {
        setError("You do not have access to download this meditation.");
      } else if (status === 409) {
        setError("This meditation is not ready to download yet.");
      } else {
        setError("Download failed. Please try again.");
      }
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleToggle}
          className="inline-flex items-center gap-2 rounded-full border border-calm-200 px-3 py-1 text-xs font-semibold text-calm-600 transition hover:border-primary-200 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={`${isPlaying ? "Pause" : "Play"} ${title}`}
          disabled={isLoading}
        >
          <span className="text-base">{isPlaying ? "⏸" : "▶"}</span>
          {isLoading ? "Loading..." : isPlaying ? "Pause" : "Play"}
        </button>
        {isAuthenticated && accessToken && (
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-2 rounded-full border border-calm-200 px-3 py-1 text-xs font-semibold text-calm-600 transition hover:border-primary-200 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={`Download ${title}`}
            disabled={isDownloading}
          >
            <span className="text-base" aria-hidden="true">
              ↓
            </span>
            {isDownloading ? "Saving..." : "Download"}
          </button>
        )}
      </div>
      {error && <span className="text-xs text-red-500">{error}</span>}
      <audio ref={audioRef} preload="none" />
    </div>
  );
}
