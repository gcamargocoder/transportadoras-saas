import { CreateChecklistTemplateDto } from './create-checklist-template.dto';

// So aceito enquanto o template esta DRAFT (ver ChecklistTemplatesService.
// update) -- substitui a arvore inteira (sections/items), por isso reusa o
// mesmo shape COMPLETO de CreateChecklistTemplateDto, nunca um "patch
// parcial" da hierarquia (evitaria ambiguidade de merge entre sections
// antigas e novas).
export class UpdateChecklistTemplateDto extends CreateChecklistTemplateDto {}
