export function buildAgentAvatarSvg(initial, palette, shape) {
    const clipShape = shape === 'rect'
        ? '<rect width="64" height="64" rx="14"/>'
        : '<circle cx="32" cy="32" r="32"/>';
    const baseShape = shape === 'rect'
        ? '<rect width="64" height="64" rx="14" fill="url(#g)"/>'
        : '<circle cx="32" cy="32" r="32" fill="url(#g)"/>';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Agent avatar">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${palette.a}"/>
<stop offset="100%" stop-color="${palette.b}"/>
</linearGradient>
<clipPath id="clip">
${clipShape}
</clipPath>
</defs>
${baseShape}
<g clip-path="url(#clip)">
<circle cx="17" cy="17" r="12" fill="${palette.c}" fill-opacity="0.24"/>
<circle cx="52" cy="53" r="16" fill="${palette.c}" fill-opacity="0.18"/>
<rect x="11" y="12" width="42" height="40" rx="10" fill="#0b1224" fill-opacity="0.12"/>
<path d="M8 44 C20 36, 32 52, 56 36 L56 64 L8 64 Z" fill="#0b1224" fill-opacity="0.1"/>
</g>
<text x="50%" y="51%" dominant-baseline="middle" text-anchor="middle" font-family="DM Sans, Arial, sans-serif" font-size="24" font-weight="700" fill="${palette.ink}">${initial}</text>
</svg>`;
}
