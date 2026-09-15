import type { TChatProject } from 'librechat-data-provider';
import InstructionsField from './InstructionsField';
import { useLocalize } from '~/hooks';
import FileList from './FileList';
import Budget from './Budget';

export default function KnowledgeSection({ project }: { project: TChatProject }) {
  const localize = useLocalize();

  return (
    <div className="flex flex-col gap-6">
      <InstructionsField project={project} />
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-text-primary">
          {localize('com_ui_project_knowledge_files')}
        </h3>
        <p className="text-xs text-text-secondary">
          {localize('com_ui_project_knowledge_files_hint')}
        </p>
        <FileList projectId={project._id} />
      </div>
      <Budget projectId={project._id} />
    </div>
  );
}
