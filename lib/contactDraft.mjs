export const CONTACT_DRAFT_KEY = "crm:new-contact-draft:v1";

export const EMPTY_CONTACT = {
  firstName: "", lastName: "", ownerType: "individual", coOwnerName: "",
  project: "", jobTitle: "", email: "", phone: "", companyName: "",
  companyWebsite: "", notes: "",
  street1: "", street2: "", city: "", state: "", zip: "", country: "US",
  propertyStreet1: "", propertyStreet2: "", propertyCity: "",
  propertyState: "", propertyZip: "", propertyCountry: "US", linkedin: "", rank: "",
};

export function hasContactDraft(formData) {
  return Object.keys(EMPTY_CONTACT).some(
    (key) => formData[key] !== EMPTY_CONTACT[key],
  );
}

export function readContactDraft(storage) {
  const raw = storage.getItem(CONTACT_DRAFT_KEY);
  if (!raw) return null;
  const draft = JSON.parse(raw);
  if (draft.version !== 1 || !draft.formData ||
      typeof draft.requestId !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(draft.requestId)) {
    throw new Error("Invalid contact draft");
  }
  const formData = { ...EMPTY_CONTACT };
  for (const key of Object.keys(EMPTY_CONTACT)) {
    if (typeof draft.formData[key] === "string") formData[key] = draft.formData[key];
  }
  return hasContactDraft(formData) ? { formData, requestId: draft.requestId } : null;
}

export function writeContactDraft(storage, formData, requestId) {
  if (!hasContactDraft(formData)) {
    storage.removeItem(CONTACT_DRAFT_KEY);
    return;
  }
  storage.setItem(CONTACT_DRAFT_KEY, JSON.stringify({ version: 1, formData, requestId }));
}
