import testNewsletter from "./testNewsletter";

const templates = [testNewsletter];

export function getEmailTemplates() {
  return templates;
}

export function getEmailTemplate(id) {
  return templates.find((template) => template.id === id) || null;
}
