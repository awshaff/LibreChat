import { useEffect, useRef, useState } from 'react';
import debounce from 'lodash/debounce';
import { MAX_CHAT_PROJECT_INSTRUCTIONS_LENGTH } from 'librechat-data-provider';
import type { TChatProject } from 'librechat-data-provider';
import { useUpdateProjectMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

export default function InstructionsField({ project }: { project: TChatProject }) {
  const localize = useLocalize();
  const [value, setValue] = useState(project.instructions ?? '');
  const { mutate } = useUpdateProjectMutation();
  const projectIdRef = useRef(project._id);
  projectIdRef.current = project._id;

  useEffect(() => {
    setValue(project.instructions ?? '');
  }, [project._id, project.instructions]);

  const debouncedSave = useRef(
    debounce((projectId: string, instructions: string) => {
      mutate({ projectId, instructions });
    }, 600),
  ).current;

  useEffect(() => {
    return () => debouncedSave.flush();
  }, [debouncedSave]);

  const handleChange: React.ChangeEventHandler<HTMLTextAreaElement> = (event) => {
    const nextValue = event.target.value.slice(0, MAX_CHAT_PROJECT_INSTRUCTIONS_LENGTH);
    setValue(nextValue);
    debouncedSave(projectIdRef.current, nextValue);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="project-instructions" className="text-sm font-medium text-text-primary">
        {localize('com_ui_project_instructions')}
      </label>
      <p className="text-xs text-text-secondary">{localize('com_ui_project_instructions_hint')}</p>
      <textarea
        id="project-instructions"
        value={value}
        onChange={handleChange}
        placeholder={localize('com_ui_project_instructions_placeholder')}
        maxLength={MAX_CHAT_PROJECT_INSTRUCTIONS_LENGTH}
        rows={5}
        className="w-full resize-y rounded-xl border border-border-medium bg-surface-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
      />
      <span className="self-end text-xs text-text-tertiary">
        {value.length}/{MAX_CHAT_PROJECT_INSTRUCTIONS_LENGTH}
      </span>
    </div>
  );
}
