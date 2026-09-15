import { useState } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import { useLocalize } from '~/hooks';

/**
 * Surfaces `message.metadata.projectKnowledgeTruncated`, set server-side
 * (`AgentClient.buildResponseMetadata`) when project knowledge had to be
 * trimmed to fit this conversation's model context window. Per-message local
 * dismissal only — re-shows on reload, which is fine for a "heads up" notice.
 */
export default function ProjectKnowledgeTruncatedNotice() {
  const localize = useLocalize();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return null;
  }

  return (
    <div
      role="status"
      className="mb-2 flex items-center gap-2 rounded-lg bg-status-warning-subtle px-3 py-2 text-xs text-status-warning"
    >
      <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="flex-1">{localize('com_ui_project_knowledge_truncated')}</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={localize('com_ui_dismiss')}
        className="shrink-0 rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
