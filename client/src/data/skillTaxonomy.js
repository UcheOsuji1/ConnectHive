// 19-category skill taxonomy — replaces the original 7-category SKILL_CATS.
// Covers knowledge work, trades, health, science, education, culinary, sports,
// arts, music, writing/language, public service, and personal development.

export const SKILL_CATS = [
  { key: 'software', emoji: '💻', name: 'Software & Development',
    desc: 'What do you build or code?',
    chips: ['⚛️ Frontend / React','🐍 Python','🟨 JavaScript','☕ Java / Kotlin','📱 iOS / Swift','🤖 Android','🗄️ Backend / APIs','☁️ Cloud / DevOps','🤖 AI / ML','🔐 Cybersecurity','🎮 Game Dev','⛓️ Blockchain / Web3','🗃️ Databases / SQL','🧪 QA / Testing','🐳 Docker / Kubernetes'] },

  { key: 'data', emoji: '📊', name: 'Data & Analytics',
    desc: 'How do you work with data?',
    chips: ['📈 Data Analysis','🤖 Machine Learning','📊 Data Visualization','🗃️ SQL / Databases','🐍 Python / Pandas','📉 Financial Modeling','🔬 Research Methods','📋 UX Research / Surveys','🧮 Statistics','🧠 NLP / LLMs','📡 Data Engineering','🔭 Business Intelligence'] },

  { key: 'engineering', emoji: '⚙️', name: 'Engineering & Making',
    desc: 'What do you design and build in the physical world?',
    chips: ['🏗️ Civil / Structural','⚡ Electrical Engineering','🔧 Mechanical Engineering','✈️ Aerospace','🏭 Manufacturing','🔩 Hardware / Embedded','🤖 Robotics / Automation','🔋 Renewable Energy','🛢️ Chemical Engineering','🌊 Environmental Engineering','🖨️ 3D Printing / Prototyping','🧰 Product Engineering'] },

  { key: 'design', emoji: '🎨', name: 'Design & Visual',
    desc: 'What kind of design work do you do?',
    chips: ['🖥️ UI / UX Design','🖌️ Graphic Design','🎬 Motion / Animation','📦 Product Design','🏗️ Industrial Design','🏠 Interior / Architecture','👗 Fashion Design','🖋️ Brand / Identity','🌐 Web Design','🖼️ Illustration','📐 Figma / Prototyping','🎨 3D Modeling'] },

  { key: 'marketing', emoji: '📢', name: 'Marketing & Growth',
    desc: 'How do you grow things?',
    chips: ['📱 Social Media Marketing','✍️ Content Marketing','🔍 SEO / SEM','📧 Email Marketing','🤝 Partnerships / BD','📊 Analytics / Growth Hacking','🎤 PR / Communications','💰 Paid Ads / PPC','🎥 Video Marketing','🌐 Community Building','💡 Brand Strategy','📈 Performance Marketing'] },

  { key: 'business', emoji: '💼', name: 'Business & Leadership',
    desc: 'How do you lead and build?',
    chips: ['🚀 Entrepreneurship','📋 Project Management','🏆 Team Leadership','💰 Sales / Negotiation','📊 Business Strategy','🤝 Operations / Ops','🗂️ Event Planning','🎤 Public Speaking','🌐 International Business','📑 Consulting','🏢 Corporate Strategy','🌱 Social Enterprise'] },

  { key: 'content', emoji: '🎬', name: 'Content & Media',
    desc: 'What kind of content do you create?',
    chips: ['📹 Video Editing','🎙️ Podcasting','✍️ Copywriting / Blogging','📸 Photography','🎵 Music Production','📱 Short-form / Reels','🖥️ Live Streaming','📝 Journalism / Reporting','📖 Screenwriting','🎨 Graphic Creation','📺 Documentary','🤳 Influencer / Creator'] },

  { key: 'writing', emoji: '✍️', name: 'Writing & Language',
    desc: 'What do you write or speak?',
    chips: ['📖 Creative Writing','📄 Technical Writing','🔖 Editing / Proofreading','🌍 Translation','🗣️ Interpreting','📚 Bilingual / Multilingual','📝 Grant Writing','⚖️ Legal Writing','📓 Poetry','📧 Business Writing','🗞️ Essays / Long-form','🏷️ Localization'] },

  { key: 'arts', emoji: '🎭', name: 'Arts & Performance',
    desc: 'How do you perform and create?',
    chips: ['🎭 Acting / Theater','🎬 Film / TV Acting','🎙️ Voice Acting','🎤 Hosting / MC','🎪 Improv / Comedy','😂 Stand-up Comedy','💃 Dance / Choreography','🎶 Musical Theater','🎨 Fine Art / Painting','✏️ Drawing / Illustration','🏺 Sculpture / Ceramics','🎻 Music Performance'] },

  { key: 'music', emoji: '🎵', name: 'Music & Audio',
    desc: 'How do you make sound?',
    chips: ['🎸 Guitar / Bass','🎹 Piano / Keys','🥁 Drums / Percussion','🎤 Vocals','🎻 Strings','🎺 Brass / Woodwind','🎵 Music Production','🎚️ Mixing / Mastering','🎧 DJing','🎼 Composition / Arranging','🔊 Live Sound','🎙️ Audio Engineering'] },

  { key: 'health', emoji: '🏥', name: 'Health & Medicine',
    desc: 'How do you care for others?',
    chips: ['🩺 Nursing','👨‍⚕️ Medicine / Clinical','🦷 Dentistry','💊 Pharmacy','🧠 Psychology / Therapy','🏃 Personal Training','🧘 Yoga / Pilates Instruction','🥗 Nutrition / Dietetics','🦴 Physical Therapy','💆 Massage Therapy','🧪 Medical Research','🚑 Emergency Medicine'] },

  { key: 'education', emoji: '📚', name: 'Education & Teaching',
    desc: 'How do you teach and guide others?',
    chips: ['👩‍🏫 K–12 Teaching','🏫 Higher Education','📖 Tutoring / Academic Coaching','🎓 Curriculum Design','👶 Early Childhood Education','🌍 ESL / Language Teaching','🧑‍💻 Coding Education','🎨 Arts Education','📊 STEM Education','🌱 Special Education','🎤 Corporate Training','📱 EdTech / E-Learning'] },

  { key: 'culinary', emoji: '🍳', name: 'Culinary & Hospitality',
    desc: 'What do you create in the kitchen and beyond?',
    chips: ['🍳 Professional Cooking','🥐 Pastry / Baking','🍷 Wine / Beverage Service','🍸 Bartending / Mixology','🏨 Hotel / Resort Management','🍽️ Restaurant Operations','🧑‍🍳 Private Chef / Catering','🌿 Farm-to-Table Sourcing','🍫 Chocolate / Confectionery','🥩 Butchery / Charcuterie','📸 Food Photography','🌮 Food Truck / Pop-up'] },

  { key: 'trades', emoji: '🔨', name: 'Skilled Trades',
    desc: 'What do you build, fix, or install?',
    chips: ['⚡ Electrician','🔧 Plumbing','🪵 Carpentry / Woodworking','🏠 Construction / General Contracting','🌡️ HVAC / Refrigeration','🔩 Welding / Metalwork','🚗 Automotive / Mechanic','🏗️ Masonry / Concrete','🪟 Glazing / Fenestration','🛁 Tiling / Flooring','🔌 Low-Voltage / A/V Systems','⚙️ Millwright / Industrial Maintenance'] },

  { key: 'science', emoji: '🔬', name: 'Science & Research',
    desc: 'What do you investigate and discover?',
    chips: ['🧬 Biology / Genetics','⚗️ Chemistry','⚛️ Physics','🌍 Earth / Environmental Science','🌌 Astronomy','🧪 Lab Techniques','🔭 Clinical Trials','🦠 Microbiology / Immunology','📐 Mathematics','🌊 Marine Science','🌱 Botany / Ecology','🐾 Zoology / Animal Science'] },

  { key: 'sports', emoji: '🏆', name: 'Sports & Athletics',
    desc: 'What is your relationship with sport?',
    chips: ['🏋️ Strength & Conditioning','🏀 Basketball Coaching','⚽ Soccer / Football Coaching','🎾 Tennis Coaching','🏊 Swimming Coaching','🥊 Boxing / MMA Coaching','🏌️ Golf Instruction','🧗 Climbing Coaching','🚴 Cycling / Triathlon','🏃 Running / Track Coaching','🏐 Volleyball Coaching','⚾ Baseball / Softball Coaching'] },

  { key: 'law', emoji: '⚖️', name: 'Law & Public Service',
    desc: 'How do you serve or protect your community?',
    chips: ['⚖️ Legal Practice / Attorney','👮 Law Enforcement','🚒 Fire & Emergency Services','🏛️ Government / Policy','🌐 Nonprofit / NGO Leadership','🤝 Social Work','🧑‍⚖️ Paralegal / Legal Research','🌍 International Relations','📣 Advocacy / Community Organizing','🪖 Military / Veterans Affairs','🛡️ Compliance / Regulatory','🏘️ Urban Planning'] },

  { key: 'finance', emoji: '💵', name: 'Finance & Real Estate',
    desc: 'How do you manage and grow capital?',
    chips: ['📊 Accounting / Bookkeeping','💰 Investment Banking','📈 Stock / Equity Trading','🏠 Real Estate Sales','🏢 Commercial Real Estate','💵 Financial Planning','🪙 Crypto / DeFi','💳 FinTech','📑 Tax / CPA','🌐 Venture Capital / PE','🏦 Banking / Lending','📋 Insurance / Risk Management'] },

  { key: 'coaching', emoji: '🌱', name: 'Coaching & Wellness',
    desc: 'How do you help others grow?',
    chips: ['🧭 Life Coaching','💼 Career Coaching','🧠 Executive / Leadership Coaching','💑 Relationship Coaching','🧘 Mindfulness / Meditation','🌱 Wellness Coaching','😴 Sleep & Recovery','🥗 Health & Lifestyle Coaching','💪 Athletic / Performance Coaching','📚 Academic Coaching','🌿 Holistic / Integrative Health','🎯 Goal Setting / Accountability'] },
];

// Dev-only guard: two chips sharing a label (text after the emoji prefix) but
// different full strings silently inflates match scores and defeats the custom-
// entry dedup from Part 2. Throws at module load time in the Vite dev server so
// the error is impossible to miss. Tree-shaken from production builds.
if (import.meta.env.DEV) {
  const seen = new Map(); // normalised label → first full chip string
  for (const cat of SKILL_CATS) {
    for (const chip of cat.chips) {
      // Label = everything after the first space (strip leading emoji).
      const label = chip.split(' ').slice(1).join(' ').toLowerCase();
      if (seen.has(label) && seen.get(label) !== chip) {
        throw new Error(
          `[skillTaxonomy] Duplicate chip label "${label}":\n` +
          `  "${seen.get(label)}" (first occurrence)\n` +
          `  "${chip}" (${cat.name})\n` +
          `Use the same full string or choose a different label.`
        );
      }
      seen.set(label, chip);
    }
  }
}
