// Role suggestions for Project Collaboration's RoleBuilder (Building a team)
// and RoleWishlist (Joining a project). Keyed by the exact proj-types chip
// string (see PROJECT_CHIPS_TYPES in CategoryDeepDivePage.jsx). Each entry is
// { title, skills }, where `skills` are 0-3 exact chip strings from
// SKILL_CATS that fit the role (empty array when nothing in the taxonomy fits).

import { SKILL_CATS } from './skillTaxonomy.js';

export const ROLE_SUGGESTIONS = {
  '📱 App / Software team': [
    { title: 'Frontend developer', skills: ['⚛️ Frontend / React'] },
    { title: 'Backend developer', skills: ['🗄️ Backend / APIs'] },
    { title: 'Mobile developer', skills: ['📱 iOS / Swift', '🤖 Android'] },
    { title: 'UI/UX designer', skills: ['🖥️ UI / UX Design'] },
    { title: 'Product manager', skills: ['📋 Project Management'] },
    { title: 'QA tester', skills: ['🧪 QA / Testing'] },
    { title: 'Marketer', skills: ['📱 Social Media Marketing'] },
  ],
  '🚀 Co-founding a startup': [
    { title: 'Technical co-founder', skills: ['🗄️ Backend / APIs'] },
    { title: 'Business co-founder', skills: ['🚀 Entrepreneurship'] },
    { title: 'Designer', skills: ['🖥️ UI / UX Design'] },
    { title: 'Marketer', skills: ['📱 Social Media Marketing'] },
    { title: 'Sales lead', skills: ['💰 Sales / Negotiation'] },
    { title: 'Finance / fundraising lead', skills: ['💵 Financial Planning'] },
  ],
  '🎬 Film / video crew': [
    { title: 'Director', skills: [] },
    { title: 'Producer', skills: [] },
    { title: 'Actor', skills: ['🎭 Acting / Theater', '🎬 Film / TV Acting'] },
    { title: 'Cinematographer', skills: ['📸 Photography'] },
    { title: 'Editor', skills: ['📹 Video Editing'] },
    { title: 'Sound mixer', skills: ['🎚️ Mixing / Mastering'] },
    { title: 'Screenwriter', skills: ['📖 Screenwriting'] },
    { title: 'Gaffer', skills: [] },
    { title: 'Composer', skills: ['🎼 Composition / Arranging'] },
    { title: 'Makeup artist', skills: [] },
  ],
  '🎵 Music production team': [
    { title: 'Vocalist', skills: ['🎤 Vocals'] },
    { title: 'Producer', skills: ['🎵 Music Production'] },
    { title: 'Songwriter', skills: ['🎼 Composition / Arranging'] },
    { title: 'Guitarist', skills: ['🎸 Guitar / Bass'] },
    { title: 'Drummer', skills: ['🥁 Drums / Percussion'] },
    { title: 'Mixing engineer', skills: ['🎚️ Mixing / Mastering'] },
    { title: 'Cover artist', skills: ['🖼️ Illustration'] },
  ],
  '📝 Content / media collective': [
    { title: 'Video editor', skills: ['📹 Video Editing'] },
    { title: 'Writer', skills: ['✍️ Copywriting / Blogging'] },
    { title: 'Photographer', skills: ['📸 Photography'] },
    { title: 'Social media manager', skills: ['📱 Social Media Marketing'] },
    { title: 'Host', skills: ['🎤 Hosting / MC'] },
    { title: 'Graphic designer', skills: ['🖌️ Graphic Design'] },
  ],
  '🎨 Creative studio / design team': [
    { title: 'Graphic designer', skills: ['🖌️ Graphic Design'] },
    { title: 'Illustrator', skills: ['🖼️ Illustration'] },
    { title: 'Brand designer', skills: ['🖋️ Brand / Identity'] },
    { title: 'Motion designer', skills: ['🎬 Motion / Animation'] },
    { title: '3D artist', skills: ['🎨 3D Modeling'] },
    { title: 'Art director', skills: [] },
  ],
  '🛍️ Brand / e-commerce venture': [
    { title: 'Brand designer', skills: ['🖋️ Brand / Identity'] },
    { title: 'Marketer', skills: ['📱 Social Media Marketing'] },
    { title: 'Photographer', skills: ['📸 Photography'] },
    { title: 'Copywriter', skills: ['✍️ Copywriting / Blogging'] },
    { title: 'Operations lead', skills: ['🤝 Operations / Ops'] },
    { title: 'Web developer', skills: ['⚛️ Frontend / React'] },
  ],
  '🤖 AI / ML research group': [
    { title: 'ML engineer', skills: ['🤖 Machine Learning'] },
    { title: 'Data scientist', skills: ['📈 Data Analysis'] },
    { title: 'Data engineer', skills: ['📡 Data Engineering'] },
    { title: 'Researcher', skills: ['🔬 Research Methods'] },
    { title: 'Backend developer', skills: ['🗄️ Backend / APIs'] },
  ],
  '📚 Research & academic collab': [
    { title: 'Researcher', skills: ['🔬 Research Methods'] },
    { title: 'Data analyst', skills: ['📈 Data Analysis'] },
    { title: 'Statistician', skills: ['🧮 Statistics'] },
    { title: 'Writer', skills: ['📄 Technical Writing'] },
    { title: 'Research assistant', skills: ['🔬 Research Methods'] },
  ],
  '🏗️ Physical product / hardware': [
    { title: 'Mechanical engineer', skills: ['🔧 Mechanical Engineering'] },
    { title: 'Electrical engineer', skills: ['⚡ Electrical Engineering'] },
    { title: 'Industrial designer', skills: ['🏗️ Industrial Design'] },
    { title: 'Embedded developer', skills: ['🔩 Hardware / Embedded'] },
    { title: 'Prototyping / 3D printing', skills: ['🖨️ 3D Printing / Prototyping'] },
    { title: 'Manufacturing lead', skills: ['🏭 Manufacturing'] },
  ],
  '🌿 Social impact project': [
    { title: 'Program coordinator', skills: ['📋 Project Management'] },
    { title: 'Fundraiser', skills: ['📝 Grant Writing'] },
    { title: 'Community organizer', skills: ['📣 Advocacy / Community Organizing'] },
    { title: 'Marketer', skills: ['📱 Social Media Marketing'] },
    { title: 'Volunteer coordinator', skills: ['🤝 Social Work'] },
  ],
  '🎓 Student project group': [
    { title: 'Developer', skills: ['🗄️ Backend / APIs'] },
    { title: 'Designer', skills: ['🖥️ UI / UX Design'] },
    { title: 'Researcher', skills: ['🔬 Research Methods'] },
    { title: 'Writer', skills: ['✍️ Copywriting / Blogging'] },
    { title: 'Presenter', skills: ['🎤 Public Speaking'] },
  ],
  '🎮 Game studio': [
    { title: 'Game developer', skills: ['🎮 Game Dev'] },
    { title: 'Game designer', skills: ['🎮 Game Dev'] },
    { title: '3D artist', skills: ['🎨 3D Modeling'] },
    { title: '2D / pixel artist', skills: ['🖼️ Illustration'] },
    { title: 'Sound designer', skills: ['🎙️ Audio Engineering'] },
    { title: 'Composer', skills: ['🎼 Composition / Arranging'] },
    { title: 'Writer', skills: ['📖 Creative Writing'] },
    { title: 'Playtester', skills: ['🧪 QA / Testing'] },
  ],
  '👕 Fashion / clothing brand': [
    { title: 'Fashion designer', skills: ['👗 Fashion Design'] },
    { title: 'Pattern maker', skills: [] },
    { title: 'Graphic designer', skills: ['🖌️ Graphic Design'] },
    { title: 'Photographer', skills: ['📸 Photography'] },
    { title: 'Model', skills: [] },
    { title: 'Social media manager', skills: ['📱 Social Media Marketing'] },
    { title: 'Production / sourcing lead', skills: ['🤝 Operations / Ops'] },
  ],
  '🍳 Food / culinary venture': [
    { title: 'Chef', skills: ['🍳 Professional Cooking'] },
    { title: 'Pastry chef', skills: ['🥐 Pastry / Baking'] },
    { title: 'Line cook', skills: ['🍳 Professional Cooking'] },
    { title: 'Bartender', skills: ['🍸 Bartending / Mixology'] },
    { title: 'Food photographer', skills: ['📸 Food Photography'] },
    { title: 'Operations manager', skills: ['🍽️ Restaurant Operations'] },
    { title: 'Marketer', skills: ['📱 Social Media Marketing'] },
  ],
  '🎭 Theater / live performance': [
    { title: 'Director', skills: [] },
    { title: 'Actor', skills: ['🎭 Acting / Theater'] },
    { title: 'Stage manager', skills: [] },
    { title: 'Choreographer', skills: ['💃 Dance / Choreography'] },
    { title: 'Lighting designer', skills: [] },
    { title: 'Set designer', skills: [] },
    { title: 'Musician', skills: ['🎻 Music Performance'] },
  ],
  '🎙️ Podcast / audio show': [
    { title: 'Co-host', skills: ['🎙️ Podcasting'] },
    { title: 'Producer', skills: ['🎙️ Podcasting'] },
    { title: 'Audio editor', skills: ['🎙️ Audio Engineering'] },
    { title: 'Guest booker', skills: [] },
    { title: 'Social media manager', skills: ['📱 Social Media Marketing'] },
    { title: 'Cover artist', skills: ['🖼️ Illustration'] },
  ],
  '📖 Book / publishing': [
    { title: 'Editor', skills: ['🔖 Editing / Proofreading'] },
    { title: 'Co-writer', skills: ['📖 Creative Writing'] },
    { title: 'Illustrator', skills: ['🖼️ Illustration'] },
    { title: 'Cover designer', skills: ['🖌️ Graphic Design'] },
    { title: 'Proofreader', skills: ['🔖 Editing / Proofreading'] },
    { title: 'Marketer', skills: ['📱 Social Media Marketing'] },
  ],
  '🎪 Event production': [
    { title: 'Event planner', skills: ['🗂️ Event Planning'] },
    { title: 'Promoter', skills: ['📱 Social Media Marketing'] },
    { title: 'DJ', skills: ['🎧 DJing'] },
    { title: 'Photographer', skills: ['📸 Photography'] },
    { title: 'Sound tech', skills: ['🔊 Live Sound'] },
    { title: 'Volunteer coordinator', skills: ['🤝 Social Work'] },
  ],
};

// Vite-side dev guard, same shape as skillTaxonomy.js's own: every `skills`
// entry here must be an exact SKILL_CATS chip, or a future taxonomy edit
// silently breaks suggestions instead of failing loudly.
if (import.meta.env.DEV) {
  const allChips = new Set(SKILL_CATS.flatMap(c => c.chips));
  for (const [type, roles] of Object.entries(ROLE_SUGGESTIONS)) {
    for (const { title, skills } of roles) {
      for (const skill of skills) {
        if (!allChips.has(skill)) {
          throw new Error(
            `[roleSuggestions] "${skill}" (role "${title}" under "${type}") is not an exact SKILL_CATS chip.`,
          );
        }
      }
    }
  }
}
