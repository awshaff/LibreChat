import { useEffect, useMemo } from 'react';
import { LocalStorageKeys } from 'librechat-data-provider';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import { useLocalize } from '~/hooks';

export type ModelSelection = { endpoint: string; model: string };

function readLastUsedSelection(): Partial<ModelSelection> {
  try {
    const raw = localStorage.getItem(LocalStorageKeys.LAST_CONVO_SETUP + '_0');
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as { endpoint?: string | null; model?: string | null };
    return {
      endpoint: parsed.endpoint ?? undefined,
      model: parsed.model ?? undefined,
    };
  } catch {
    return {};
  }
}

/**
 * A project isn't bound to one conversation's model, so the budget preview needs its
 * own picker. This is a plain native `<select>` rather than the composer's model
 * dropdown, which is tightly coupled to active-conversation state, jotai/recoil atoms,
 * and the full model-spec resolution system — out of scope for an advisory,
 * settings-page estimate that never sends a message.
 */
export default function ModelPicker({
  value,
  onChange,
}: {
  value: ModelSelection | null;
  onChange: (selection: ModelSelection) => void;
}) {
  const localize = useLocalize();
  const { data: modelsConfig } = useGetModelsQuery();

  const endpoints = useMemo(() => Object.keys(modelsConfig ?? {}), [modelsConfig]);

  useEffect(() => {
    if (value || endpoints.length === 0 || !modelsConfig) {
      return;
    }
    const lastUsed = readLastUsedSelection();
    const endpoint =
      lastUsed.endpoint && endpoints.includes(lastUsed.endpoint) ? lastUsed.endpoint : endpoints[0];
    const models = modelsConfig[endpoint] ?? [];
    const model =
      lastUsed.model && models.includes(lastUsed.model) ? lastUsed.model : (models[0] ?? '');
    if (endpoint && model) {
      onChange({ endpoint, model });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoints, modelsConfig, value]);

  if (!value) {
    return null;
  }

  const models = modelsConfig?.[value.endpoint] ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={localize('com_ui_project_knowledge_budget_endpoint')}
        value={value.endpoint}
        onChange={(event) => {
          const endpoint = event.target.value;
          const nextModels = modelsConfig?.[endpoint] ?? [];
          onChange({ endpoint, model: nextModels[0] ?? '' });
        }}
        className="rounded-lg border border-border-medium bg-surface-secondary px-2 py-1 text-xs text-text-primary"
      >
        {endpoints.map((endpoint) => (
          <option key={endpoint} value={endpoint}>
            {endpoint}
          </option>
        ))}
      </select>
      <select
        aria-label={localize('com_ui_project_knowledge_budget_model')}
        value={value.model}
        onChange={(event) => onChange({ endpoint: value.endpoint, model: event.target.value })}
        className="rounded-lg border border-border-medium bg-surface-secondary px-2 py-1 text-xs text-text-primary"
      >
        {models.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
    </div>
  );
}
