import { useEffect, useState } from 'react';

/** Original, lightweight scene built around the supplied peanut identity. */
export function ProductAuthScene({ state }: { state: string }) {
  const [paused, setPaused] = useState(document.hidden);
  useEffect(() => {
    const changed = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  return (
    <div
      className="collo-companion-scene"
      data-state={state}
      data-paused={paused}
      aria-hidden="true"
    >
      <svg viewBox="0 0 640 580" fill="none">
        <defs>
          <linearGradient
            id="collo-scene-wall"
            x1="320"
            y1="50"
            x2="320"
            y2="470"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="var(--scene-wall)" />
            <stop offset="1" stopColor="var(--scene-paper)" />
          </linearGradient>
          <linearGradient
            id="collo-scene-seed"
            x1="270"
            y1="220"
            x2="360"
            y2="390"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#E8C2A1" />
            <stop offset="1" stopColor="#D49B74" />
          </linearGradient>
        </defs>
        <path
          d="M108 414V220C108 103 202 58 320 58C438 58 532 103 532 220V414"
          fill="url(#collo-scene-wall)"
        />
        <path
          d="M130 414V222C130 118 215 80 320 80C425 80 510 118 510 222V414"
          stroke="var(--scene-rule)"
          strokeWidth="1.5"
        />
        <path d="M320 81V234M131 237H510" stroke="var(--scene-rule)" strokeWidth="1.5" />
        <circle cx="415" cy="170" r="30" fill="var(--scene-sun)" />
        <path
          d="M132 330C197 285 250 298 320 328C383 355 441 291 508 304V414H132Z"
          fill="var(--scene-hill)"
        />
        <ellipse cx="320" cy="450" rx="244" ry="45" fill="var(--scene-ground)" />
        <path
          d="M135 420C170 420 164 462 219 462H399C445 462 431 413 480 413"
          stroke="var(--scene-cable)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M204 403H443" stroke="var(--scene-desk)" strokeWidth="12" strokeLinecap="round" />
        <path
          d="M224 409V451M422 409V451"
          stroke="var(--scene-desk)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <g className="collo-scene-station">
          <path
            d="M90 391C90 364 111 344 139 344C167 344 188 364 188 391V421H90Z"
            fill="var(--scene-station)"
            stroke="var(--scene-rule)"
            strokeWidth="2"
          />
          <path
            d="M108 391H170"
            stroke="var(--scene-cable)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="139" cy="409" r="3" fill="var(--scene-signal)" />
          <path
            d="M472 391V377C472 355 490 337 512 337C534 337 552 355 552 377V419H472Z"
            fill="var(--scene-station)"
            stroke="var(--scene-rule)"
            strokeWidth="2"
          />
          <path
            d="M486 388H539"
            stroke="var(--scene-cable)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="512" cy="405" r="3" fill="var(--scene-signal)" />
        </g>
        <ellipse cx="322" cy="397" rx="61" ry="9" fill="var(--scene-shadow)" />
        <g className="collo-scene-companion">
          <path
            d="M292 383L284 397M343 383L352 397"
            stroke="#8C644D"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path
            d="M287 244C301 231 325 232 340 247C361 268 351 286 347 299C342 314 363 330 360 352C357 379 338 392 315 389C288 387 273 370 275 348C277 329 290 317 283 300C274 278 268 261 287 244Z"
            fill="url(#collo-scene-seed)"
            stroke="#B78260"
            strokeWidth="2"
          />
          <path
            d="M296 250C288 257 286 267 289 275"
            stroke="#F6DAC0"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <g className="collo-scene-eyes" stroke="#5C473E" strokeWidth="4" strokeLinecap="round">
            <path d="M310 277V283M332 277V283" />
          </g>
          <path
            d="M315 296C320 299 326 299 330 295"
            stroke="#97664D"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M281 327C268 332 263 346 271 355M349 321C367 316 373 326 378 337"
            stroke="#B78260"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <g className="collo-scene-note">
            <rect
              x="352"
              y="328"
              width="50"
              height="37"
              rx="5"
              transform="rotate(-9 352 328)"
              fill="var(--scene-note)"
              stroke="var(--scene-cable)"
              strokeWidth="1.5"
            />
            <path
              d="M361 340L377 349L394 334"
              stroke="var(--scene-cable)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          <path d="M375 338L382 343" stroke="#D7A482" strokeWidth="7" strokeLinecap="round" />
        </g>
        <g fill="var(--scene-signal)">
          <circle className="collo-scene-pulse" cx="220" cy="462" r="4" />
          <circle cx="454" cy="442" r="3" opacity=".5" />
        </g>
        <path
          d="M188 176V188M182 182H194"
          stroke="var(--scene-cable)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity=".55"
        />
        <circle cx="456" cy="271" r="3" fill="var(--scene-cable)" opacity=".4" />
      </svg>
    </div>
  );
}
