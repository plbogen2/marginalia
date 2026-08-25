import React, { useState } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  RotateCcw, 
  RotateCw, 
  Volume2, 
  VolumeX, 
  X, 
  Loader2, 
  ChevronUp, 
  ChevronDown 
} from 'lucide-react';

interface TtsPlayerBarProps {
  isSpeaking: boolean;
  isPaused: boolean;
  isTtsLoading: boolean;
  currentChunkIndex: number;
  totalChunks: number;
  currentChunkText: string;
  playbackSpeed: number;
  activeFile: string | null;
  onTogglePause: () => void;
  onSkipNext: () => void;
  onSkipPrevious: () => void;
  onSkipForward: (seconds?: number) => void;
  onSkipBackward: (seconds?: number) => void;
  onSeekToChunk: (index: number) => void;
  onChangeSpeed: (speed: number) => void;
  onStop: () => void;
}

export const TtsPlayerBar: React.FC<TtsPlayerBarProps> = ({
  isSpeaking,
  isPaused,
  isTtsLoading,
  currentChunkIndex,
  totalChunks,
  currentChunkText,
  playbackSpeed,
  activeFile,
  onTogglePause,
  onSkipNext,
  onSkipPrevious,
  onSkipForward,
  onSkipBackward,
  onSeekToChunk,
  onChangeSpeed,
  onStop,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!isSpeaking && !isPaused && !isTtsLoading && totalChunks === 0) {
    return null;
  }

  const speedPresets = [0.75, 1.0, 1.25, 1.5, 2.0];

  const handleCycleSpeed = () => {
    const currentIndex = speedPresets.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % speedPresets.length;
    onChangeSpeed(speedPresets[nextIndex]);
  };

  const progressPercent = totalChunks > 1 
    ? Math.min(100, Math.round(((currentChunkIndex + 1) / totalChunks) * 100))
    : 100;

  return (
    <div className={`tts-player-floating-bar ${isExpanded ? 'expanded' : 'collapsed'}`}>
      {/* Progress Track at Top */}
      <div 
        className="tts-progress-track"
        title={`Paragraph ${currentChunkIndex + 1} of ${totalChunks || 1} (${progressPercent}%)`}
      >
        <div 
          className="tts-progress-fill" 
          style={{ width: `${progressPercent}%` }}
        />
        {totalChunks > 1 && (
          <input
            type="range"
            min={0}
            max={totalChunks - 1}
            value={currentChunkIndex}
            onChange={(e) => onSeekToChunk(Number(e.target.value))}
            className="tts-progress-slider"
            aria-label="Seek paragraph chunk"
          />
        )}
      </div>

      <div className="tts-player-main">
        {/* Left: Info & Excerpt */}
        <div className="tts-info-group">
          <div className="tts-status-indicator">
            {isTtsLoading ? (
              <Loader2 size={16} className="tts-spin" />
            ) : isPaused ? (
              <VolumeX size={16} className="tts-paused-icon" />
            ) : (
              <Volume2 size={16} className="tts-playing-icon pulse" />
            )}
          </div>
          <div className="tts-meta">
            <div className="tts-title-row">
              <span className="tts-file-label">{activeFile || 'Manuscript'}</span>
              <span className="tts-chunk-badge">
                {totalChunks > 0 ? `${currentChunkIndex + 1} / ${totalChunks}` : '1 / 1'}
              </span>
            </div>
            {isExpanded && currentChunkText && (
              <div className="tts-text-snippet" title={currentChunkText}>
                "{currentChunkText}"
              </div>
            )}
          </div>
        </div>

        {/* Center: Controls */}
        <div className="tts-controls-group">
          <button
            type="button"
            className="tts-ctrl-btn"
            onClick={onSkipPrevious}
            title="Previous Paragraph (Alt+Left / Alt+J)"
            disabled={currentChunkIndex <= 0}
          >
            <SkipBack size={15} />
          </button>

          <button
            type="button"
            className="tts-ctrl-btn"
            onClick={() => onSkipBackward(10)}
            title="Rewind 10 seconds"
          >
            <RotateCcw size={15} />
            <span className="tts-sub-label">10</span>
          </button>

          <button
            type="button"
            className={`tts-play-btn ${isPaused ? 'paused' : 'playing'} ${isTtsLoading ? 'loading' : ''}`}
            onClick={onTogglePause}
            title={isTtsLoading ? "Synthesizing audio..." : isPaused ? "Resume Playback (Alt+Space)" : "Pause Playback (Alt+Space)"}
          >
            {isTtsLoading ? (
              <Loader2 size={18} className="tts-spin" />
            ) : isPaused ? (
              <Play size={18} fill="currentColor" />
            ) : (
              <Pause size={18} fill="currentColor" />
            )}
          </button>

          <button
            type="button"
            className="tts-ctrl-btn"
            onClick={() => onSkipForward(10)}
            title="Forward 10 seconds"
          >
            <RotateCw size={15} />
            <span className="tts-sub-label">10</span>
          </button>

          <button
            type="button"
            className="tts-ctrl-btn"
            onClick={onSkipNext}
            title="Next Paragraph (Alt+Right / Alt+L)"
            disabled={currentChunkIndex >= totalChunks - 1}
          >
            <SkipForward size={15} />
          </button>
        </div>

        {/* Right: Speed, Toggle Expand & Close */}
        <div className="tts-right-group">
          <button
            type="button"
            className="tts-speed-btn"
            onClick={handleCycleSpeed}
            title="Toggle playback speed"
          >
            {playbackSpeed}x
          </button>

          <button
            type="button"
            className="tts-expand-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "Collapse player" : "Expand player"}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>

          <button
            type="button"
            className="tts-stop-btn"
            onClick={onStop}
            title="Stop & Close Read Aloud (Escape)"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
