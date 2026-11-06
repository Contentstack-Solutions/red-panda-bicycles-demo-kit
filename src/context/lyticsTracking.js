"use client";
import { useEffect, useState } from "react";

const snippet = `!function(){"use strict";var c=window.jstag||(window.jstag={}),a=[];function n(o){c[o]=function(){for(var n=arguments.length,t=new Array(n),r=0;r<n;r++)t[r]=arguments[r];return a.push([o,t]),c}}function t(i){c[i]=function(){for(var n=!1,t=function(){n=!0},r=arguments.length,o=new Array(r),e=0;e<r;e++)o[e]=arguments[e];return a.push([i,o,function(){return n},function(n){t=function(){n()}}]),t}}n("send"),n("mock"),n("identify"),n("pageView"),n("unblock"),n("getid"),n("setid"),n("call"),t("on"),t("once"),c.asyncVersion="3.0.37",c.loadScript=function(n,t,r){var o=document.createElement("script");o.async=!0,o.src=n,o.onload=t,o.onerror=r;var e=document.getElementsByTagName("script")[0],i=e&&e.parentNode||document.head||document.body,c=e||i.lastChild;return null!=c?i.insertBefore(o,c):i.appendChild(o),this},c.init=function n(t){return c.config=t,c.loadScript(t.src,function(){if(c.init===n)return void console.warn("Lytics: tag failed to load or is misconfigured; tracking disabled.");c.init(c.config),function(){for(var n=0;n<a.length;n++){var t=a[n][0],r=a[n][1],o=a[n][2],e=a[n][3];if(!o||!o()){var i=c[t].apply(c,r);e&&e(i)}}a=void 0}()}),c}}();`;

// Degrade gracefully when Lytics isn't configured (no LYTICS_TAG): return a
// no-op stub so nothing tries to load a script pointed at a placeholder tag,
// and consumers like the dev tools panel can render an empty state instead
// of erroring.
const NOOP_JSTAG = {
  send() {}, identify() {}, pageView() {}, mock() {}, unblock() {},
  getid(cb) { if (typeof cb === "function") cb(null); }, setid() {}, call() {},
  on() { return () => {}; }, once() { return () => {}; },
};

export const useJstag = () => {
  if (!process.env.LYTICS_TAG) {
    return NOOP_JSTAG;
  }
  if (typeof jstag === "undefined" && typeof window !== "undefined") {
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.text = snippet;
    document.head.appendChild(script);

    jstag.init({
      src: `https://c.lytics.io/api/tag/${process.env.LYTICS_TAG || "your-lytics-tag"}/latest.min.js`,
      audit: { level: "carp" },
      contentstack: {
        entitySync: { disabled: false },
        entityPush: { disabled: true },
      },
    });
  }
  if (typeof jstag !== "undefined") {
    return jstag;
  }
  return undefined;
};

export const useEntity = () => {
  const jstag = useJstag();
  const [entity, setEntity] = useState(null);

  useEffect(() => {
    const off = jstag.on("entity.loaded", (_, entity) => {
      setEntity(entity);
    });
    return () => {
      off();
    };
  }, []);

  return entity;
};

export function LyticsTracking() {
  const jstag = useJstag();

  useEffect(() => {
    jstag.pageView();
  }, [jstag]);

  return <></>;
}