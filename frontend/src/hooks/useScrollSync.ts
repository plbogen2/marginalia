import { useEffect } from 'react';

export function useScrollSync(activeFile: string | null, previewOpen: boolean) {
  useEffect(() => {
    if (!activeFile || !previewOpen) return;

    const timer = setTimeout(() => {
      const editorScrollEl = document.querySelector('.editor-cm-wrapper .cm-scroller');
      const previewScrollEl = document.querySelector('.preview-content');

      if (!editorScrollEl || !previewScrollEl) return;

      let isSyncingEditorScroll = false;
      let isSyncingPreviewScroll = false;

      const handleEditorScroll = () => {
        if (isSyncingPreviewScroll) {
          isSyncingPreviewScroll = false;
          return;
        }
        isSyncingEditorScroll = true;
        const maxEditor = editorScrollEl.scrollHeight - editorScrollEl.clientHeight;
        const maxPreview = previewScrollEl.scrollHeight - previewScrollEl.clientHeight;
        if (maxEditor > 0 && maxPreview > 0) {
          const percentage = editorScrollEl.scrollTop / maxEditor;
          previewScrollEl.scrollTop = percentage * maxPreview;
        }
      };

      const handlePreviewScroll = () => {
        if (isSyncingEditorScroll) {
          isSyncingEditorScroll = false;
          return;
        }
        isSyncingPreviewScroll = true;
        const maxEditor = editorScrollEl.scrollHeight - editorScrollEl.clientHeight;
        const maxPreview = previewScrollEl.scrollHeight - previewScrollEl.clientHeight;
        if (maxEditor > 0 && maxPreview > 0) {
          const percentage = previewScrollEl.scrollTop / maxPreview;
          editorScrollEl.scrollTop = percentage * maxEditor;
        }
      };

      editorScrollEl.addEventListener('scroll', handleEditorScroll);
      previewScrollEl.addEventListener('scroll', handlePreviewScroll);

      return () => {
        editorScrollEl.removeEventListener('scroll', handleEditorScroll);
        previewScrollEl.removeEventListener('scroll', handlePreviewScroll);
      };
    }, 100);

    return () => clearTimeout(timer);
  }, [activeFile, previewOpen]);
}
