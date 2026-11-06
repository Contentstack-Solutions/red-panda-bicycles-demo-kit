"use client";

import { useEffect } from "react";
import { usePersonalize } from "@/context/personalize.context";
import { impressionAliases, trackImpressions } from "@/lib/analytics";

// Tells Personalize a variant of this entry was shown. Renders nothing, and
// does nothing for base (unpersonalized) content.
export default function VariantImpressions({ entry }) {
  const personalize = usePersonalize();
  const key = impressionAliases(entry).join(",");

  useEffect(() => {
    if (key) trackImpressions(personalize, entry);
    // Re-fire only when the shown variants change, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalize, key]);

  return null;
}
