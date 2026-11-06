// Maps the CMS "background_color" picklist values to Tailwind classes.
const SECTION_BACKGROUND_CLASSES = {
  "Warm Eggshell": "bg-cream",
  White: "bg-white",
  "Blue Gray": "bg-blue-gray",
};

export function sectionBackgroundClass(label, fallback = "bg-cream") {
  return SECTION_BACKGROUND_CLASSES[label] || fallback;
}
