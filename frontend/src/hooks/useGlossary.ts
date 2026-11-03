import { useState, useEffect, useCallback, useRef } from 'react';

export interface GlossaryConfig {
  paths: string[];
  autoDetect: boolean;
  enableSpellcheck: boolean;
  enableAutocomplete: boolean;
}

export interface GlossaryTerm {
  term: string;
  normalized: string;
  definition?: string;
  category?: string;
  file: string;
}

export interface UseGlossaryReturn {
  config: GlossaryConfig;
  availableFiles: string[];
  resolvedFiles: string[];
  terms: GlossaryTerm[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateConfig: (partial: Partial<GlossaryConfig>) => Promise<void>;
}

const DEFAULT_CONFIG: GlossaryConfig = {
  paths: [],
  autoDetect: true,
  enableSpellcheck: true,
  enableAutocomplete: true
};

export function useGlossary(activeWorkspacePath?: string): UseGlossaryReturn {
  const [config, setConfig] = useState<GlossaryConfig>(DEFAULT_CONFIG);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [resolvedFiles, setResolvedFiles] = useState<string[]>([]);
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const prevWorkspaceRef = useRef<string | undefined>(activeWorkspacePath);

  const fetchGlossary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/glossary');
      if (!res.ok) {
        throw new Error(`Failed to load glossary: ${res.statusText}`);
      }
      const data = await res.json() as {
        config: GlossaryConfig;
        availableFiles: string[];
        resolvedFiles: string[];
        terms: GlossaryTerm[];
      };
      setConfig(data.config || DEFAULT_CONFIG);
      setAvailableFiles(data.availableFiles || []);
      setResolvedFiles(data.resolvedFiles || []);
      setTerms(data.terms || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateConfig = useCallback(async (partial: Partial<GlossaryConfig>) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/glossary/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial)
      });
      if (!res.ok) {
        throw new Error(`Failed to save glossary config: ${res.statusText}`);
      }
      const data = await res.json() as {
        config: GlossaryConfig;
        availableFiles: string[];
        resolvedFiles: string[];
        terms: GlossaryTerm[];
      };
      setConfig(data.config);
      setAvailableFiles(data.availableFiles || []);
      setResolvedFiles(data.resolvedFiles || []);
      setTerms(data.terms || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeWorkspacePath !== prevWorkspaceRef.current || !terms.length) {
      prevWorkspaceRef.current = activeWorkspacePath;
      fetchGlossary();
    }
  }, [activeWorkspacePath, fetchGlossary, terms.length]);

  return {
    config,
    availableFiles,
    resolvedFiles,
    terms,
    loading,
    error,
    refresh: fetchGlossary,
    updateConfig
  };
}
