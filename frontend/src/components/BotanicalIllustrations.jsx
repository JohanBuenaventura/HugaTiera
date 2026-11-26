/* ==========================================================================
   Botanical Flat Vector Illustrations (GreenScape Aesthetic)
   ========================================================================== */

export function WelcomeBotanicalScene({ className = '' }) {
  return (
    <svg
      className={`botanical-svg botanical-float ${className}`}
      viewBox="0 0 440 340"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Soft backdrop trapezoid / garden frame */}
      <path d="M52 74L322 44V222H52V74Z" fill="#FAF9F5" opacity="0.92" />
      <circle cx="96" cy="52" r="5" stroke="#303A30" strokeWidth="1.5" opacity="0.55" />
      <circle cx="294" cy="40" r="6" stroke="#303A30" strokeWidth="1.5" opacity="0.5" />
      <circle cx="268" cy="112" r="3" fill="#263D2E" opacity="0.65" />
      <circle cx="384" cy="96" r="4" fill="#D8A16F" opacity="0.85" />
      <circle cx="222" cy="56" r="3.5" fill="#A5B994" />

      {/* Left semicircle planter */}
      <path d="M48 222C48 271.706 88.2944 312 138 312C187.706 312 228 271.706 228 222H48Z" fill="#2B3040" />
      <path d="M90 222C90 248.51 111.49 270 138 270C164.51 270 186 248.51 186 222H90Z" fill="#A5B994" />

      {/* Botanical stems & circular leaves */}
      <path d="M138 222V88" stroke="#263D2E" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="138" cy="78" r="24" fill="#A5B994" />
      <circle cx="138" cy="78" r="10" fill="#B5BE9A" />

      <path d="M138 158C138 158 104 148 92 128" stroke="#263D2E" strokeWidth="2" strokeLinecap="round" />
      <circle cx="88" cy="122" r="17" fill="#A5B994" />
      <path d="M138 186C138 186 112 178 102 162" stroke="#263D2E" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="100" cy="160" r="10" fill="#B5BE9A" />

      <path d="M138 140C138 140 174 132 190 112" stroke="#263D2E" strokeWidth="2" strokeLinecap="round" />
      <circle cx="196" cy="108" r="16" fill="#A5B994" />
      <path d="M138 192C138 192 168 186 180 170" stroke="#263D2E" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="184" cy="166" r="11" fill="#D8A16F" opacity="0.75" />

      {/* Right semicircle & friendly sitting character */}
      <path d="M232 222C232 268.392 269.608 306 316 306C362.392 306 400 268.392 400 222H232Z" fill="#304936" />
      <path d="M236 222C264 206 304 202 332 222H236Z" fill="#E9E2CE" opacity="0.22" />

      {/* Sitting person holding a young plant */}
      <g transform="translate(278, 92)">
        {/* Hair & head */}
        <circle cx="44" cy="24" r="15" fill="#263D2E" />
        <circle cx="44" cy="8" r="7" fill="#263D2E" />
        <circle cx="41" cy="26" r="10" fill="#F2D2B6" />
        {/* Torso */}
        <path d="M28 42C28 36 56 36 58 44L62 84H26L28 42Z" fill="#D8A16F" />
        {/* Legs */}
        <path d="M28 82L12 118L22 122L38 92L54 128L66 124L56 82H28Z" fill="#2B3040" />
        {/* Shoes */}
        <ellipse cx="14" cy="122" rx="8" ry="4.5" fill="#FAF9F5" />
        <ellipse cx="62" cy="128" rx="8" ry="4.5" fill="#FAF9F5" />
        {/* Arm & small sprout */}
        <path d="M32 48L14 66L28 72" stroke="#F2D2B6" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 64V44" stroke="#263D2E" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="9" cy="46" rx="7" ry="4" transform="rotate(-25 9 46)" fill="#A5B994" />
        <ellipse cx="19" cy="46" rx="7" ry="4" transform="rotate(25 19 46)" fill="#B5BE9A" />
      </g>
    </svg>
  )
}

export function PottedPlantIllustration({ variant = 'monstera', className = '' }) {
  return (
    <svg
      className={`botanical-svg ${className}`}
      viewBox="0 0 180 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Organic soft background circle */}
      <circle cx="90" cy="92" r="68" fill="#E9E2CE" opacity="0.65" />
      {variant === 'orange' ? (
        <>
          <circle cx="122" cy="52" r="22" fill="#D8A16F" opacity="0.35" />
          {/* Tall snake-plant / palm leaves */}
          <path d="M90 118C74 86 68 54 78 32C90 52 94 84 90 118Z" fill="#263D2E" />
          <path d="M92 118C106 82 116 54 106 30C92 52 88 86 92 118Z" fill="#304936" />
          <path d="M84 118C62 94 50 74 56 54C70 72 78 94 84 118Z" fill="#A5B994" />
          <path d="M98 118C118 96 130 76 126 56C110 72 102 94 98 118Z" fill="#B5BE9A" />
        </>
      ) : (
        <>
          <circle cx="56" cy="56" r="18" fill="#A5B994" opacity="0.45" />
          {/* Lush broadleaf plant */}
          <path d="M90 120V56" stroke="#263D2E" strokeWidth="3" strokeLinecap="round" />
          <path d="M90 88C68 82 54 66 58 48C76 52 88 68 90 88Z" fill="#263D2E" />
          <path d="M90 78C114 70 126 54 122 38C104 42 92 58 90 78Z" fill="#304936" />
          <path d="M90 102C68 102 52 94 48 80C66 78 80 86 90 102Z" fill="#A5B994" />
          <path d="M90 104C112 104 126 94 130 80C112 78 98 86 90 104Z" fill="#B5BE9A" />
          <ellipse cx="90" cy="44" rx="14" ry="20" fill="#A5B994" />
        </>
      )}
      {/* Clean ceramic pot */}
      <path d="M62 116H118L110 152C109 156 105 158 101 158H79C75 158 71 156 70 152L62 116Z" fill="#FAF9F5" stroke="#263D2E" strokeWidth="2" />
      <rect x="58" y="110" width="64" height="10" rx="5" fill="#D8A16F" />
    </svg>
  )
}

export function GardenPlanningIllustration({ className = '' }) {
  return (
    <svg
      className={`botanical-svg ${className}`}
      viewBox="0 0 220 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M36 96C36 58 74 28 118 32C162 36 190 66 184 102C178 134 138 144 96 142C56 140 36 122 36 96Z" fill="#E9E2CE" opacity="0.7" />
      {/* Sun / spark orb */}
      <circle cx="156" cy="48" r="16" fill="#D8A16F" opacity="0.85" />
      <circle cx="156" cy="48" r="24" stroke="#D8A16F" strokeWidth="1.5" strokeDasharray="4 4" />
      {/* Stylized botanical hills */}
      <path d="M46 122C66 94 98 92 122 122H46Z" fill="#A5B994" />
      <path d="M98 122C122 86 158 86 180 122H98Z" fill="#263D2E" />
      {/* Sprout */}
      <path d="M110 112V68" stroke="#263D2E" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M110 82C92 80 84 68 88 56C100 58 108 68 110 82Z" fill="#304936" />
      <path d="M110 74C126 70 136 58 132 48C118 50 112 60 110 74Z" fill="#B5BE9A" />
      {/* Watering droplets */}
      <circle cx="72" cy="54" r="4" fill="#A5B994" />
      <circle cx="64" cy="68" r="3" fill="#263D2E" opacity="0.4" />
    </svg>
  )
}

export function GardenerCareIllustration({ className = '' }) {
  return (
    <svg
      className={`botanical-svg ${className}`}
      viewBox="0 0 220 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="110" cy="84" r="64" fill="#EDF2E8" />
      {/* Leaves backdrop */}
      <path d="M58 124C48 92 56 64 78 52C82 78 74 106 58 124Z" fill="#A5B994" />
      <path d="M164 124C174 92 166 64 144 52C140 78 148 106 164 124Z" fill="#B5BE9A" />
      {/* Stylized Gardener */}
      <circle cx="110" cy="48" r="14" fill="#F2D2B6" />
      {/* Straw sun hat */}
      <path d="M88 46H132C126 32 94 32 88 46Z" fill="#D8A16F" />
      <ellipse cx="110" cy="46" rx="28" ry="5" fill="#D8A16F" />
      {/* Apron & shirt */}
      <path d="M86 68C86 60 134 60 134 68L138 118H82L86 68Z" fill="#263D2E" />
      <rect x="94" y="74" width="32" height="44" rx="6" fill="#E9E2CE" />
      {/* Small pot in hands */}
      <rect x="98" y="88" width="24" height="18" rx="4" fill="#D8A16F" />
      <path d="M110 88V74" stroke="#263D2E" strokeWidth="2" />
      <circle cx="104" cy="74" r="5" fill="#A5B994" />
      <circle cx="116" cy="74" r="5" fill="#304936" />
    </svg>
  )
}

export function EmptyGardenIllustration({ className = '' }) {
  return (
    <svg
      className={`botanical-svg ${className}`}
      viewBox="0 0 140 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <ellipse cx="70" cy="96" rx="46" ry="12" fill="#E9E2CE" />
      <path d="M52 68H88L83 96C82.5 98 80.5 100 78 100H62C59.5 100 57.5 98 57 96L52 68Z" fill="#FAF9F5" stroke="#263D2E" strokeWidth="2" />
      <rect x="49" y="62" width="42" height="8" rx="4" fill="#D8A16F" />
      <path d="M70 62V34" stroke="#263D2E" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M70 46C56 44 48 34 52 24C62 26 68 34 70 46Z" fill="#A5B994" />
      <path d="M70 40C84 38 92 28 88 18C78 20 72 28 70 40Z" fill="#304936" />
      <circle cx="40" cy="34" r="4" fill="#B5BE9A" opacity="0.7" />
      <circle cx="102" cy="28" r="3" fill="#D8A16F" opacity="0.8" />
    </svg>
  )
}

export function BotanicalCornerAccent({ className = '' }) {
  return (
    <svg
      className={`botanical-corner-accent ${className}`}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="96" cy="24" r="48" fill="currentColor" opacity="0.12" />
      <path d="M110 10C88 18 76 34 74 56C94 52 108 36 110 10Z" fill="currentColor" opacity="0.2" />
      <path d="M84 4C66 16 58 30 60 48C74 42 84 26 84 4Z" fill="currentColor" opacity="0.14" />
    </svg>
  )
}
