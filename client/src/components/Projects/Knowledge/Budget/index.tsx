import { useState } from 'react';
import { useProjectKnowledgeBudgetQuery, useTokenConfigQuery } from '~/data-provider';
import ModelPicker, { type ModelSelection } from './ModelPicker';
import Gauge from '~/components/Chat/Input/TokenUsage/Gauge';
import { useLocalize } from '~/hooks';
import Breakdown from './Breakdown';

export default function Budget({ projectId }: { projectId: string }) {
  const localize = useLocalize();
  const [selection, setSelection] = useState<ModelSelection | null>(null);

  const { data } = useProjectKnowledgeBudgetQuery(projectId);
  /** Same source the chat composer's own gauge reads (`useTokenLimits`) — it already
   *  resolves custom endpoints and fetched/yaml token-config overrides that a bare
   *  `getModelMaxTokens(model, endpoint)` call misses. */
  const { data: tokenConfig } = useTokenConfigQuery();
  const maxContextTokens = selection
    ? (tokenConfig?.[selection.endpoint]?.[selection.model]?.context ?? null)
    : null;
  const totalTokens = data?.totalTokens ?? 0;
  const indeterminate = maxContextTokens == null;
  const percent = indeterminate ? 0 : Math.min(100, (totalTokens / maxContextTokens) * 100);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-light bg-surface-secondary p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-text-primary">
          {localize('com_ui_project_knowledge_budget')}
        </h3>
        <ModelPicker value={selection} onChange={setSelection} />
      </div>
      <div className="flex items-center gap-3">
        <Gauge percent={percent} indeterminate={indeterminate} />
        <div className="text-sm text-text-secondary">
          {indeterminate
            ? localize('com_ui_project_knowledge_budget_unknown', {
                used: totalTokens.toLocaleString(),
              })
            : localize('com_ui_project_knowledge_budget_usage', {
                used: totalTokens.toLocaleString(),
                max: maxContextTokens.toLocaleString(),
              })}
        </div>
      </div>
      {data ? <Breakdown data={data} /> : null}
    </div>
  );
}
