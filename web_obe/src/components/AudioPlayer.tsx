"use client";

import { useEffect, useRef, useState } from "react";
import { getStreamUrl } from "@/lib/api/meditations";
import { useAppSelector } from "@/store/hooks";

type AudioPlayerProps = {
  meditationId: number;
  title: string;
};

export default function AudioPlayer({ meditationId, title }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const { accessToken, isAuthenticated } = useAppSelector(
    (state) => state.auth,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const prepareAuthenticatedStream = async () => {
    if (objectUrlRef.current) {
      return objectUrlRef.current;
    }

    const url = getStreamUrl(meditationId);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Unable to stream this meditation");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    objectUrlRef.current = objectUrl;
    return objectUrl;
  };

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
        const objectUrl = await prepareAuthenticatedStream();
        audio.src = objectUrl;
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

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center gap-2 rounded-full border border-calm-200 px-3 py-1 text-xs font-semibold text-calm-600 transition hover:border-primary-200 hover:text-primary-700"
        aria-label={`${isPlaying ? "Pause" : "Play"} ${title}`}
        disabled={isLoading}
      >
        <span className="text-base">{isPlaying ? "⏸" : "▶"}</span>
        {isLoading ? "Loading..." : isPlaying ? "Pause" : "Play"}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
      <audio ref={audioRef} preload="none" />
    </div>
  );
}
