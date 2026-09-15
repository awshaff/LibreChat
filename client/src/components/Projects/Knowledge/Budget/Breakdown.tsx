import type { TProjectKnowledgeBudgetResponse } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

export default function Breakdown({ data }: { data: TProjectKnowledgeBudgetResponse }) {
  const localize = useLocalize();
  const isEmpty = data.files.length === 0 && data.instructionsTokens === 0;

  return (
    <div className="flex flex-col gap-1 text-xs text-text-secondary">
      {data.instructionsTokens > 0 ? (
        <div className="flex items-center justify-between gap-3">
          <span className="truncate">{localize('com_ui_project_instructions')}</span>
          <span className="shrink-0 tabular-nums">{data.instructionsTokens.toLocaleString()}</span>
        </div>
      ) : null}
      {data.files.map((file) => (
        <div key={file.file_id} className="flex items-center justify-between gap-3">
          <span className="truncate">{file.filename}</span>
          <span className="shrink-0 tabular-nums">{file.tokens.toLocaleString()}</span>
        </div>
      ))}
      {isEmpty ? <span>{localize('com_ui_project_knowledge_empty')}</span> : null}
    </div>
  );
}
