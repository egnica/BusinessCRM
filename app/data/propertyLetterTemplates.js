export const PROPERTY_LETTER_TEMPLATES = [
  {
    id: "blank",
    name: "Blank Letter",
    description: "Start with an empty letter.",
    html: "",
  },
];

export function getPropertyLetterTemplate(templateId) {
  return (
    PROPERTY_LETTER_TEMPLATES.find((template) => template.id === templateId) ||
    PROPERTY_LETTER_TEMPLATES[0]
  );
}
