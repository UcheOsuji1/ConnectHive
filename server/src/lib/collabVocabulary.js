// Canonical collab vocabulary — stable keys for every Project Collaboration and
// Professional Deep Dive option. Later steps store these keys on Hives, roles
// and join requests; matching compares keys, never emoji/label display text.
//
// Twin file: client/src/data/collabVocabulary.js — kept deep-equal to this one by
// `npm run check:collab --prefix server` (server/src/checks/collabVocabulary.check.mjs).
// Edit both together; the check fails loudly if they drift.
//
// Keys never change once this ships. Labels may change freely — matching
// never reads them.

export const PROJECT_PATHS = [
  { key: "joining", emoji: "🔍", label: "Joining a project", desc: "I want to bring my skills to someone else’s project." },
  { key: "building", emoji: "🛠️", label: "Building a team", desc: "I have a project and I’m looking for people." },
  { key: "either", emoji: "🔀", label: "Open to either", desc: "Show me both. I’ll decide once I see the fit." },
];

export const PROJECT_TYPES = [
  { key: "app_software", emoji: "📱", label: "App / Software team" },
  { key: "startup", emoji: "🚀", label: "Co-founding a startup" },
  { key: "film_video", emoji: "🎬", label: "Film / video crew" },
  { key: "music", emoji: "🎵", label: "Music production team" },
  { key: "content_media", emoji: "📝", label: "Content / media collective" },
  { key: "creative_studio", emoji: "🎨", label: "Creative studio / design team" },
  { key: "brand_ecommerce", emoji: "🛍️", label: "Brand / e-commerce venture" },
  { key: "ai_research", emoji: "🤖", label: "AI / ML research group" },
  { key: "academic_research", emoji: "📚", label: "Research & academic collab" },
  { key: "hardware", emoji: "🏗️", label: "Physical product / hardware" },
  { key: "social_impact", emoji: "🌿", label: "Social impact project" },
  { key: "student", emoji: "🎓", label: "Student project group" },
  { key: "game_studio", emoji: "🎮", label: "Game studio" },
  { key: "fashion", emoji: "👕", label: "Fashion / clothing brand" },
  { key: "food", emoji: "🍳", label: "Food / culinary venture" },
  { key: "theater", emoji: "🎭", label: "Theater / live performance" },
  { key: "podcast", emoji: "🎙️", label: "Podcast / audio show" },
  { key: "publishing", emoji: "📖", label: "Book / publishing" },
  { key: "event_production", emoji: "🎪", label: "Event production" },
];

export const PROJECT_PRIMARY_GOALS = [
  { key: "ship_product", emoji: "🚀", label: "Ship a real product or business", desc: "I'm here to build something real and launch it." },
  { key: "learn_by_building", emoji: "🧠", label: "Learn by building with others", desc: "Growth and skill-building is the main priority." },
  { key: "generate_income", emoji: "💰", label: "Generate income from the project", desc: "This needs to make money. Monetization is the goal." },
  { key: "build_portfolio", emoji: "🏆", label: "Build my portfolio / credentials", desc: "I want tangible work to show for this collaboration." },
  { key: "find_cofounder", emoji: "🌱", label: "Find a long-term co-founder", desc: "Looking for a partner, not just a project teammate." },
  { key: "complete_one_time_project", emoji: "🎯", label: "Complete a specific one-time project", desc: "Defined scope, clear end date, deliver and done." },
  { key: "create_social_impact", emoji: "🌍", label: "Create social impact", desc: "Profit isn't the point. Impact and mission are." },
  { key: "build_audience", emoji: "📣", label: "Build an audience or brand", desc: "Growing a following, platform, or creative identity." },
];

export const PROJECT_STAGES = [
  { key: "idea", emoji: "💡", label: "Just an idea", desc: "I have a concept but nothing made yet." },
  { key: "in_progress", emoji: "🔧", label: "In progress", desc: "Actively making the first version." },
  { key: "launched", emoji: "🚀", label: "Launched and growing", desc: "Already out there, looking to scale." },
];

export const PROJECT_PREF_STAGES = [
  { key: "idea", emoji: "💡", label: "Just an idea", desc: "I have a concept but nothing made yet." },
  { key: "in_progress", emoji: "🔧", label: "In progress", desc: "Actively making the first version." },
  { key: "launched", emoji: "🚀", label: "Launched and growing", desc: "Already out there, looking to scale." },
  { key: "any", emoji: "🔀", label: "Any stage" },
];

export const PROJECT_INDUSTRIES = [
  { key: "tech_software", emoji: "💻", label: "Tech / Software" },
  { key: "film_entertainment", emoji: "🎬", label: "Film & Entertainment" },
  { key: "music_audio", emoji: "🎵", label: "Music & Audio" },
  { key: "social_media_content", emoji: "📱", label: "Social media / Content" },
  { key: "ai_ml", emoji: "🤖", label: "AI / Machine Learning" },
  { key: "ecommerce_retail", emoji: "🛍️", label: "E-commerce / Retail" },
  { key: "social_impact_nonprofit", emoji: "🌍", label: "Social impact / Nonprofit" },
  { key: "health_wellness", emoji: "🏥", label: "Health & Wellness" },
  { key: "education_edtech", emoji: "🎓", label: "Education / EdTech" },
  { key: "finance_fintech", emoji: "💰", label: "Finance / Fintech" },
  { key: "art_design", emoji: "🎨", label: "Art & Design" },
  { key: "hardware_physical_product", emoji: "🏗️", label: "Hardware / Physical product" },
  { key: "sustainability_cleantech", emoji: "🌿", label: "Sustainability / CleanTech" },
  { key: "gaming_interactive", emoji: "🎮", label: "Gaming / Interactive" },
  { key: "real_estate_proptech", emoji: "🏠", label: "Real Estate / PropTech" },
  { key: "fashion_apparel", emoji: "👗", label: "Fashion & Apparel" },
  { key: "food_beverage", emoji: "🍽️", label: "Food & Beverage" },
  { key: "sports_fitness", emoji: "🏋️", label: "Sports & Fitness" },
  { key: "publishing_writing", emoji: "📖", label: "Publishing & Writing" },
  { key: "beauty_personal_care", emoji: "💄", label: "Beauty & Personal care" },
];

export const EXPERIENCE_LEVELS = [
  { key: "learning", emoji: "🌱", label: "Still learning", desc: "I’m building my skills and want real practice." },
  { key: "some", emoji: "🧩", label: "Some experience", desc: "I’ve done this on a few projects." },
  { key: "experienced", emoji: "💪", label: "Experienced", desc: "I do this regularly and can own my part." },
  { key: "expert", emoji: "🏆", label: "Expert", desc: "I can lead this area and mentor others." },
];

export const COMPENSATION = [
  { key: "paid", emoji: "💵", label: "Paid" },
  { key: "equity", emoji: "📈", label: "Equity" },
  { key: "revenue_share", emoji: "🤝", label: "Revenue share" },
  { key: "portfolio", emoji: "🏆", label: "Portfolio / credit" },
  { key: "unpaid", emoji: "🌱", label: "Unpaid / volunteer" },
  { key: "academic_credit", emoji: "🎓", label: "Academic credit" },
];

export const WORK_STYLES = [
  { key: "async", emoji: "💬", label: "Async / remote", desc: "Work independently, check in regularly online." },
  { key: "weekly_sync", emoji: "📅", label: "Weekly sync meetings", desc: "Structured check-ins, clear milestones and deadlines." },
  { key: "sprints", emoji: "🔥", label: "Intensive sprints", desc: "Deep focus, fast-paced, ship things quickly." },
  { key: "flexible", emoji: "🔀", label: "Flexible", desc: "Adapts to what the project and team need." },
];

export const COMMITMENTS = [
  { key: "full_time", emoji: "🔥", label: "Full-time", desc: "This is my main focus. All in.", hours: "40+ hrs / week", minHours: 40, maxHours: null },
  { key: "part_time", emoji: "⚡", label: "Part-time", desc: "Serious commitment alongside other work.", hours: "15–20 hrs / week", minHours: 15, maxHours: 20 },
  { key: "side_project", emoji: "📅", label: "Side project", desc: "Nights and weekends, steady progress.", hours: "5–10 hrs / week", minHours: 5, maxHours: 10 },
  { key: "casual", emoji: "🌊", label: "Casual", desc: "Low pressure, flexible timing.", hours: "A few hours when I can", minHours: 0, maxHours: 5 },
];

export const PROJECT_TIMELINES = [
  { key: "sprint", emoji: "⚡", label: "Short sprint (days–weeks)" },
  { key: "few_months", emoji: "📅", label: "A few months" },
  { key: "six_to_twelve_months", emoji: "🗓️", label: "6 months to a year" },
  { key: "long_term", emoji: "🚀", label: "Long-term / ongoing" },
  { key: "unsure", emoji: "🔍", label: "Not sure yet" },
];

export const COLLAB_FORMATS = [
  { key: "remote", emoji: "🌐", label: "Fully remote / online", desc: "Zoom, Slack, async tools. Location doesn't matter.", locationType: "online" },
  { key: "in_person", emoji: "📍", label: "In-person (local team)", desc: "I want to be in the same room as my collaborators.", locationType: "in-person" },
  { key: "hybrid", emoji: "🔀", label: "Hybrid", desc: "Mostly online with in-person days when it counts.", locationType: "hybrid" },
  { key: "coworking", emoji: "🏢", label: "Co-working space", desc: "A shared physical workspace to build together.", locationType: "in-person" },
];

export const FUNDING = [
  { key: "bootstrapped", emoji: "💵", label: "Bootstrapped", desc: "Self-funded, no outside money." },
  { key: "pre_revenue", emoji: "🤝", label: "Pre-revenue", desc: "Not funded yet, looking for partners." },
  { key: "seeking_funding", emoji: "💡", label: "Seeking funding", desc: "Actively looking for investors or grants." },
  { key: "already_funded", emoji: "💰", label: "Already funded", desc: "We have capital to work with." },
  { key: "academic_project", emoji: "🎓", label: "Academic project", desc: "School or research, no funding needed." },
];

export const CAREER_STAGES = [
  { key: "student", emoji: "🎓", label: "Student", desc: "Still in school, building foundations." },
  { key: "early", emoji: "🌱", label: "Early career (0–3 yrs)", desc: "Just getting started in my field." },
  { key: "mid", emoji: "📈", label: "Mid-career (3–8 yrs)", desc: "Growing and establishing myself." },
  { key: "senior", emoji: "🏆", label: "Senior / Leadership", desc: "Experienced, giving and getting more." },
];

export const PRO_INDUSTRIES = [
  { key: "tech_software", emoji: "💻", label: "Tech / Software" },
  { key: "film_and_media", emoji: "🎬", label: "Film & Media" },
  { key: "finance_investing", emoji: "💰", label: "Finance / Investing" },
  { key: "startups", emoji: "🚀", label: "Startups" },
  { key: "design_and_creative", emoji: "🎨", label: "Design & Creative" },
  { key: "marketing", emoji: "📢", label: "Marketing" },
  { key: "healthcare", emoji: "⚕️", label: "Healthcare" },
  { key: "law_legal", emoji: "⚖️", label: "Law / Legal" },
  { key: "education", emoji: "🏫", label: "Education" },
  { key: "real_estate", emoji: "🏗️", label: "Real Estate" },
  { key: "entertainment", emoji: "🎭", label: "Entertainment" },
  { key: "consulting", emoji: "📊", label: "Consulting" },
  { key: "retail_e_commerce", emoji: "🛍️", label: "Retail / E-commerce" },
  { key: "wellness_fitness", emoji: "🌿", label: "Wellness / Fitness" },
  { key: "government_nonprofit", emoji: "🏛️", label: "Government / Nonprofit" },
  { key: "science_research", emoji: "🔬", label: "Science / Research" },
  { key: "hospitality_travel", emoji: "✈️", label: "Hospitality / Travel" },
  { key: "manufacturing", emoji: "🏭", label: "Manufacturing" },
  { key: "gaming_esports", emoji: "🎮", label: "Gaming / Esports" },
  { key: "banking_fintech", emoji: "🏦", label: "Banking / Fintech" },
  { key: "international_global", emoji: "🌍", label: "International / Global" },
  { key: "fashion_and_apparel", emoji: "👗", label: "Fashion & Apparel" },
  { key: "food_and_beverage", emoji: "🍽️", label: "Food & Beverage" },
  { key: "sports", emoji: "🏟️", label: "Sports" },
  { key: "beauty_and_personal_care", emoji: "💄", label: "Beauty & Personal care" },
  { key: "performing_arts", emoji: "🎤", label: "Performing Arts" },
];

export const PRO_LOOKING_FOR = [
  { key: "mentor", emoji: "🧭", label: "A mentor" },
  { key: "peers_in_field", emoji: "👥", label: "Peers in my field" },
  { key: "collaborators", emoji: "🤝", label: "Collaborators" },
  { key: "job_internship_leads", emoji: "💼", label: "Job / internship leads" },
  { key: "investors_advisors", emoji: "💡", label: "Investors / advisors" },
  { key: "speaking_opportunities", emoji: "📣", label: "Speaking opportunities" },
  { key: "industry_connections", emoji: "🌐", label: "Industry connections" },
  { key: "knowledge_sharing", emoji: "🧠", label: "Knowledge sharing" },
  { key: "trends", emoji: "📰", label: "Stay current on trends" },
  { key: "leadership_development", emoji: "🏆", label: "Leadership development" },
  { key: "honest_feedback", emoji: "💬", label: "Honest career feedback" },
  { key: "accountability", emoji: "🎯", label: "Accountability for goals" },
  { key: "business_partner", emoji: "🧑‍💻", label: "Find a business partner" },
  { key: "mastermind_group", emoji: "📋", label: "Join a mastermind group" },
  { key: "podcast_media_collab", emoji: "🎙️", label: "Podcast / media collab" },
  { key: "board_advisory_roles", emoji: "🏛️", label: "Board / advisory roles" },
  { key: "international_connections", emoji: "🌍", label: "International connections" },
  { key: "social_media_growth_collab", emoji: "📱", label: "Social media growth collab" },
  { key: "mentor_next_generation", emoji: "🤲", label: "Mentor the next generation" },
];

export const PRO_NETWORK_STYLES = [
  { key: "coffee_chats", emoji: "☕", label: "1-on-1 coffee chats", desc: "Intimate, focused conversations." },
  { key: "group_events_panels", emoji: "🎤", label: "Group events & panels", desc: "Structured, high-value group settings." },
  { key: "online_async", emoji: "💬", label: "Online / async first", desc: "Chat, DMs, and virtual calls." },
  { key: "mix_of_everything", emoji: "🔀", label: "Mix of everything", desc: "Flexible, whatever makes sense." },
];

export const PRO_PRIMARY_GOALS = [
  { key: "new_job_or_promotion", emoji: "🎯", label: "Land a new job or promotion", desc: "Actively looking to move up or move on." },
  { key: "launch_or_grow_business", emoji: "🚀", label: "Launch or grow my business", desc: "Building something of my own." },
  { key: "break_into_new_industry", emoji: "💡", label: "Break into a new industry", desc: "Pivoting or expanding into new territory." },
  { key: "develop_a_skill", emoji: "🧠", label: "Develop a specific skill", desc: "Focused on learning and leveling up." },
  { key: "expand_network", emoji: "🌐", label: "Expand my professional network", desc: "More connections, more opportunities." },
  { key: "increase_income", emoji: "💰", label: "Increase my income", desc: "Freelance, raise, side income. All of the above." },
  { key: "build_authority", emoji: "🏆", label: "Build authority in my field", desc: "Become a recognized name in my industry." },
  { key: "find_business_partner", emoji: "🤝", label: "Find a business partner", desc: "Looking for a co-founder or long-term collaborator." },
];

export const PRO_WORK_SITUATIONS = [
  { key: "full_time_employee", emoji: "💼", label: "Full-time employee" },
  { key: "founder_co_founder", emoji: "🚀", label: "Founder / co-founder" },
  { key: "freelancer_consultant", emoji: "🧑‍💻", label: "Freelancer / consultant" },
  { key: "student", emoji: "🎓", label: "Student" },
  { key: "actively_job_searching", emoji: "🔍", label: "Actively job searching" },
  { key: "recently_laid_off", emoji: "🌱", label: "Recently laid off / in transition" },
  { key: "taking_a_break", emoji: "🏖️", label: "Taking a break / sabbatical" },
  { key: "multiple_things_at_once", emoji: "🔀", label: "Multiple things at once" },
];

export const MENTORSHIP_PREFS = [
  { key: "mentee", emoji: "🧭", label: "I want to be mentored", desc: "Looking for guidance, advice, and someone who's been there before." },
  { key: "mentor", emoji: "💡", label: "I want to mentor others", desc: "I have experience to share and want to help people grow." },
  { key: "both", emoji: "🔄", label: "Both, I can do either", desc: "Open to mentoring and being mentored depending on context." },
  { key: "peers", emoji: "👥", label: "Neither, just peer connections", desc: "I want equals to grow alongside, not a mentor dynamic." },
];

export const INDUSTRY_SCOPES = [
  { key: "same", emoji: "🎯", label: "Same industry only", desc: "I want deep domain expertise around me." },
  { key: "cross", emoji: "🌍", label: "Cross-industry", desc: "I value diverse perspectives from different fields." },
  { key: "any", emoji: "🔀", label: "No preference", desc: "Just match me well. Industry doesn't matter." },
];

// Role suggestions for RoleBuilder (Building a team) and RoleWishlist
// (Joining a project), keyed by PROJECT_TYPES key (not the old emoji chip
// string — re-keyed in Prompt 76). Each entry is { title, skills }, where
// `skills` are 0-3 exact chip strings from SKILL_CATS.
export const ROLE_SUGGESTIONS = {
  "app_software": [
    {
      "title": "Frontend developer",
      "skills": [
        "⚛️ Frontend / React"
      ]
    },
    {
      "title": "Backend developer",
      "skills": [
        "🗄️ Backend / APIs"
      ]
    },
    {
      "title": "Mobile developer",
      "skills": [
        "📱 iOS / Swift",
        "🤖 Android"
      ]
    },
    {
      "title": "UI/UX designer",
      "skills": [
        "🖥️ UI / UX Design"
      ]
    },
    {
      "title": "Product manager",
      "skills": [
        "📋 Project Management"
      ]
    },
    {
      "title": "QA tester",
      "skills": [
        "🧪 QA / Testing"
      ]
    },
    {
      "title": "Marketer",
      "skills": [
        "📱 Social Media Marketing"
      ]
    }
  ],
  "startup": [
    {
      "title": "Technical co-founder",
      "skills": [
        "🗄️ Backend / APIs"
      ]
    },
    {
      "title": "Business co-founder",
      "skills": [
        "🚀 Entrepreneurship"
      ]
    },
    {
      "title": "Designer",
      "skills": [
        "🖥️ UI / UX Design"
      ]
    },
    {
      "title": "Marketer",
      "skills": [
        "📱 Social Media Marketing"
      ]
    },
    {
      "title": "Sales lead",
      "skills": [
        "💰 Sales / Negotiation"
      ]
    },
    {
      "title": "Finance / fundraising lead",
      "skills": [
        "💵 Financial Planning"
      ]
    }
  ],
  "film_video": [
    {
      "title": "Director",
      "skills": []
    },
    {
      "title": "Producer",
      "skills": []
    },
    {
      "title": "Actor",
      "skills": [
        "🎭 Acting / Theater",
        "🎬 Film / TV Acting"
      ]
    },
    {
      "title": "Cinematographer",
      "skills": [
        "📸 Photography"
      ]
    },
    {
      "title": "Editor",
      "skills": [
        "📹 Video Editing"
      ]
    },
    {
      "title": "Sound mixer",
      "skills": [
        "🎚️ Mixing / Mastering"
      ]
    },
    {
      "title": "Screenwriter",
      "skills": [
        "📖 Screenwriting"
      ]
    },
    {
      "title": "Gaffer",
      "skills": []
    },
    {
      "title": "Composer",
      "skills": [
        "🎼 Composition / Arranging"
      ]
    },
    {
      "title": "Makeup artist",
      "skills": []
    }
  ],
  "music": [
    {
      "title": "Vocalist",
      "skills": [
        "🎤 Vocals"
      ]
    },
    {
      "title": "Producer",
      "skills": [
        "🎵 Music Production"
      ]
    },
    {
      "title": "Songwriter",
      "skills": [
        "🎼 Composition / Arranging"
      ]
    },
    {
      "title": "Guitarist",
      "skills": [
        "🎸 Guitar / Bass"
      ]
    },
    {
      "title": "Drummer",
      "skills": [
        "🥁 Drums / Percussion"
      ]
    },
    {
      "title": "Mixing engineer",
      "skills": [
        "🎚️ Mixing / Mastering"
      ]
    },
    {
      "title": "Cover artist",
      "skills": [
        "🖼️ Illustration"
      ]
    }
  ],
  "content_media": [
    {
      "title": "Video editor",
      "skills": [
        "📹 Video Editing"
      ]
    },
    {
      "title": "Writer",
      "skills": [
        "✍️ Copywriting / Blogging"
      ]
    },
    {
      "title": "Photographer",
      "skills": [
        "📸 Photography"
      ]
    },
    {
      "title": "Social media manager",
      "skills": [
        "📱 Social Media Marketing"
      ]
    },
    {
      "title": "Host",
      "skills": [
        "🎤 Hosting / MC"
      ]
    },
    {
      "title": "Graphic designer",
      "skills": [
        "🖌️ Graphic Design"
      ]
    }
  ],
  "creative_studio": [
    {
      "title": "Graphic designer",
      "skills": [
        "🖌️ Graphic Design"
      ]
    },
    {
      "title": "Illustrator",
      "skills": [
        "🖼️ Illustration"
      ]
    },
    {
      "title": "Brand designer",
      "skills": [
        "🖋️ Brand / Identity"
      ]
    },
    {
      "title": "Motion designer",
      "skills": [
        "🎬 Motion / Animation"
      ]
    },
    {
      "title": "3D artist",
      "skills": [
        "🎨 3D Modeling"
      ]
    },
    {
      "title": "Art director",
      "skills": []
    }
  ],
  "brand_ecommerce": [
    {
      "title": "Brand designer",
      "skills": [
        "🖋️ Brand / Identity"
      ]
    },
    {
      "title": "Marketer",
      "skills": [
        "📱 Social Media Marketing"
      ]
    },
    {
      "title": "Photographer",
      "skills": [
        "📸 Photography"
      ]
    },
    {
      "title": "Copywriter",
      "skills": [
        "✍️ Copywriting / Blogging"
      ]
    },
    {
      "title": "Operations lead",
      "skills": [
        "🤝 Operations / Ops"
      ]
    },
    {
      "title": "Web developer",
      "skills": [
        "⚛️ Frontend / React"
      ]
    }
  ],
  "ai_research": [
    {
      "title": "ML engineer",
      "skills": [
        "🤖 Machine Learning"
      ]
    },
    {
      "title": "Data scientist",
      "skills": [
        "📈 Data Analysis"
      ]
    },
    {
      "title": "Data engineer",
      "skills": [
        "📡 Data Engineering"
      ]
    },
    {
      "title": "Researcher",
      "skills": [
        "🔬 Research Methods"
      ]
    },
    {
      "title": "Backend developer",
      "skills": [
        "🗄️ Backend / APIs"
      ]
    }
  ],
  "academic_research": [
    {
      "title": "Researcher",
      "skills": [
        "🔬 Research Methods"
      ]
    },
    {
      "title": "Data analyst",
      "skills": [
        "📈 Data Analysis"
      ]
    },
    {
      "title": "Statistician",
      "skills": [
        "🧮 Statistics"
      ]
    },
    {
      "title": "Writer",
      "skills": [
        "📄 Technical Writing"
      ]
    },
    {
      "title": "Research assistant",
      "skills": [
        "🔬 Research Methods"
      ]
    }
  ],
  "hardware": [
    {
      "title": "Mechanical engineer",
      "skills": [
        "🔧 Mechanical Engineering"
      ]
    },
    {
      "title": "Electrical engineer",
      "skills": [
        "⚡ Electrical Engineering"
      ]
    },
    {
      "title": "Industrial designer",
      "skills": [
        "🏗️ Industrial Design"
      ]
    },
    {
      "title": "Embedded developer",
      "skills": [
        "🔩 Hardware / Embedded"
      ]
    },
    {
      "title": "Prototyping / 3D printing",
      "skills": [
        "🖨️ 3D Printing / Prototyping"
      ]
    },
    {
      "title": "Manufacturing lead",
      "skills": [
        "🏭 Manufacturing"
      ]
    }
  ],
  "social_impact": [
    {
      "title": "Program coordinator",
      "skills": [
        "📋 Project Management"
      ]
    },
    {
      "title": "Fundraiser",
      "skills": [
        "📝 Grant Writing"
      ]
    },
    {
      "title": "Community organizer",
      "skills": [
        "📣 Advocacy / Community Organizing"
      ]
    },
    {
      "title": "Marketer",
      "skills": [
        "📱 Social Media Marketing"
      ]
    },
    {
      "title": "Volunteer coordinator",
      "skills": [
        "🤝 Social Work"
      ]
    }
  ],
  "student": [
    {
      "title": "Developer",
      "skills": [
        "🗄️ Backend / APIs"
      ]
    },
    {
      "title": "Designer",
      "skills": [
        "🖥️ UI / UX Design"
      ]
    },
    {
      "title": "Researcher",
      "skills": [
        "🔬 Research Methods"
      ]
    },
    {
      "title": "Writer",
      "skills": [
        "✍️ Copywriting / Blogging"
      ]
    },
    {
      "title": "Presenter",
      "skills": [
        "🎤 Public Speaking"
      ]
    }
  ],
  "game_studio": [
    {
      "title": "Game developer",
      "skills": [
        "🎮 Game Dev"
      ]
    },
    {
      "title": "Game designer",
      "skills": [
        "🎮 Game Dev"
      ]
    },
    {
      "title": "3D artist",
      "skills": [
        "🎨 3D Modeling"
      ]
    },
    {
      "title": "2D / pixel artist",
      "skills": [
        "🖼️ Illustration"
      ]
    },
    {
      "title": "Sound designer",
      "skills": [
        "🎙️ Audio Engineering"
      ]
    },
    {
      "title": "Composer",
      "skills": [
        "🎼 Composition / Arranging"
      ]
    },
    {
      "title": "Writer",
      "skills": [
        "📖 Creative Writing"
      ]
    },
    {
      "title": "Playtester",
      "skills": [
        "🧪 QA / Testing"
      ]
    }
  ],
  "fashion": [
    {
      "title": "Fashion designer",
      "skills": [
        "👗 Fashion Design"
      ]
    },
    {
      "title": "Pattern maker",
      "skills": []
    },
    {
      "title": "Graphic designer",
      "skills": [
        "🖌️ Graphic Design"
      ]
    },
    {
      "title": "Photographer",
      "skills": [
        "📸 Photography"
      ]
    },
    {
      "title": "Model",
      "skills": []
    },
    {
      "title": "Social media manager",
      "skills": [
        "📱 Social Media Marketing"
      ]
    },
    {
      "title": "Production / sourcing lead",
      "skills": [
        "🤝 Operations / Ops"
      ]
    }
  ],
  "food": [
    {
      "title": "Chef",
      "skills": [
        "🍳 Professional Cooking"
      ]
    },
    {
      "title": "Pastry chef",
      "skills": [
        "🥐 Pastry / Baking"
      ]
    },
    {
      "title": "Line cook",
      "skills": [
        "🍳 Professional Cooking"
      ]
    },
    {
      "title": "Bartender",
      "skills": [
        "🍸 Bartending / Mixology"
      ]
    },
    {
      "title": "Food photographer",
      "skills": [
        "📸 Food Photography"
      ]
    },
    {
      "title": "Operations manager",
      "skills": [
        "🍽️ Restaurant Operations"
      ]
    },
    {
      "title": "Marketer",
      "skills": [
        "📱 Social Media Marketing"
      ]
    }
  ],
  "theater": [
    {
      "title": "Director",
      "skills": []
    },
    {
      "title": "Actor",
      "skills": [
        "🎭 Acting / Theater"
      ]
    },
    {
      "title": "Stage manager",
      "skills": []
    },
    {
      "title": "Choreographer",
      "skills": [
        "💃 Dance / Choreography"
      ]
    },
    {
      "title": "Lighting designer",
      "skills": []
    },
    {
      "title": "Set designer",
      "skills": []
    },
    {
      "title": "Musician",
      "skills": [
        "🎻 Music Performance"
      ]
    }
  ],
  "podcast": [
    {
      "title": "Co-host",
      "skills": [
        "🎙️ Podcasting"
      ]
    },
    {
      "title": "Producer",
      "skills": [
        "🎙️ Podcasting"
      ]
    },
    {
      "title": "Audio editor",
      "skills": [
        "🎙️ Audio Engineering"
      ]
    },
    {
      "title": "Guest booker",
      "skills": []
    },
    {
      "title": "Social media manager",
      "skills": [
        "📱 Social Media Marketing"
      ]
    },
    {
      "title": "Cover artist",
      "skills": [
        "🖼️ Illustration"
      ]
    }
  ],
  "publishing": [
    {
      "title": "Editor",
      "skills": [
        "🔖 Editing / Proofreading"
      ]
    },
    {
      "title": "Co-writer",
      "skills": [
        "📖 Creative Writing"
      ]
    },
    {
      "title": "Illustrator",
      "skills": [
        "🖼️ Illustration"
      ]
    },
    {
      "title": "Cover designer",
      "skills": [
        "🖌️ Graphic Design"
      ]
    },
    {
      "title": "Proofreader",
      "skills": [
        "🔖 Editing / Proofreading"
      ]
    },
    {
      "title": "Marketer",
      "skills": [
        "📱 Social Media Marketing"
      ]
    }
  ],
  "event_production": [
    {
      "title": "Event planner",
      "skills": [
        "🗂️ Event Planning"
      ]
    },
    {
      "title": "Promoter",
      "skills": [
        "📱 Social Media Marketing"
      ]
    },
    {
      "title": "DJ",
      "skills": [
        "🎧 DJing"
      ]
    },
    {
      "title": "Photographer",
      "skills": [
        "📸 Photography"
      ]
    },
    {
      "title": "Sound tech",
      "skills": [
        "🔊 Live Sound"
      ]
    },
    {
      "title": "Volunteer coordinator",
      "skills": [
        "🤝 Social Work"
      ]
    }
  ]
};


// Safety ceilings, not product limits — the owner chooses their own role
// count, spot count and skill lists; these just stop one Hive from writing
// an unbounded amount of JSON. Values a key validator/trimmer, never a UI cap
// the product actually wants enforced as "the" limit.
export const COLLAB_LIMITS = {
  maxRoles: 25, maxSlotsPerRole: 50, maxSkillsPerRole: 12, maxRoleTitle: 60,
  maxSkills: 30, maxWantRoles: 8, maxOther: 10, maxOtherLength: 60,
  maxProIndustries: 5,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

// Reassemble the display chip string from a vocabulary item: "🐍 Python".
export function display(item) {
  return `${item.emoji} ${item.label}`;
}

// A list of display chip strings, e.g. for ChipGroup's `chips` prop.
export function asChips(list) {
  return list.map(display);
}

// A list of { emoji, name, desc, hours? } objects, e.g. for CardGrid's `cards`
// prop — "name" is what CardGrid/the mockups call the label. `hours` is only
// included when the item actually has one (TimeCardGrid's cards) — an
// explicit `hours: undefined` on every other card is a different object
// shape than "no hours key at all" as far as deep-equality is concerned.
export function asCards(list) {
  return list.map(it => {
    const card = { emoji: it.emoji, name: it.label, desc: it.desc };
    if (it.hours !== undefined) card.hours = it.hours;
    return card;
  });
}

// "🐍 Python" -> "python" — strips only the leading non-letter/non-digit run
// (emoji, variation selectors, ZWJ, the space after it), never the first
// "word": splitting on the first space ate the first real word of any
// emoji-less entry ("Data science" -> "science"; "Underwater welding" and
// "Overwater welding" both -> "welding"). Copied here (not imported) so this
// module stays import-free, per its own header contract.
export function skillLabel(text) {
  return String(text).replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Accepts a chip string ("🐍 Python"), a bare label ("Python") or a key
// ("python") and returns that item's key, or null if nothing in `list`
// matches. Comparison uses skillLabel normalization against each item's
// label and its display chip string, plus an exact key match.
export function keyForLabel(list, text) {
  if (text == null) return null;
  const norm = skillLabel(text);
  for (const item of list) {
    if (item.key === text) return item.key;
    if (skillLabel(item.label) === norm) return item.key;
    if (skillLabel(display(item)) === norm) return item.key;
  }
  return null;
}

const MAX_SKILLS = COLLAB_LIMITS.maxSkills;
const MAX_ROLE_SKILLS = COLLAB_LIMITS.maxSkillsPerRole;
const MAX_ROLES = COLLAB_LIMITS.maxRoles;
const MAX_WANT_ROLES = COLLAB_LIMITS.maxWantRoles;
const MAX_OTHER_ENTRIES = COLLAB_LIMITS.maxOther;
const MAX_TITLE_LEN = COLLAB_LIMITS.maxRoleTitle;
const MAX_OTHER_LEN = COLLAB_LIMITS.maxOtherLength;

function trimTitle(s) {
  return String(s ?? '').trim().slice(0, MAX_TITLE_LEN);
}

// Dedupe a list of free-typed skill/role strings by skillLabel, trimmed,
// capped at `max` — warns (never throws) when the cap actually trims
// something, so a silently-dropped entry is at least visible in the console.
function dedupeTrimmed(arr, max, field) {
  const out = [];
  const seen = new Set();
  for (const raw of arr ?? []) {
    const s = String(raw).trim();
    if (!s) continue;
    const label = skillLabel(s);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(s);
  }
  if (out.length > max) {
    console.warn(`[collabVocabulary] ${field}: ${out.length} entries exceed the ${max} limit — trimming.`);
    return out.slice(0, max);
  }
  return out;
}

// A multi-select chip array -> { keys, other }. Unmatched values (the
// customizable "+ Something else" entries) go to `other`, trimmed, deduped,
// capped at MAX_OTHER_ENTRIES / MAX_OTHER_LEN. Never throws.
function splitMultiSelect(list, chips, field) {
  const keys = [];
  const other = [];
  for (const chip of chips ?? []) {
    const key = keyForLabel(list, chip);
    if (key) { keys.push(key); continue; }
    const text = String(chip).trim().slice(0, MAX_OTHER_LEN);
    if (text) other.push(text);
  }
  const dedupedOther = dedupeTrimmed(other, MAX_OTHER_ENTRIES, field);
  return { keys, other: dedupedOther };
}

// A single-select card/chip value -> key or null. An unrecognized value is
// loud (console.warn) and dropped — single-select has no "other" bucket, so
// silently keeping it would mean storing a display string where a key is
// expected everywhere downstream.
function singleKey(list, value, field) {
  if (value == null) return null;
  const key = keyForLabel(list, value);
  if (!key) {
    console.warn(`[collabVocabulary] unknown value for ${field}:`, value);
    return null;
  }
  return key;
}

function normalizeProject(chips, cards, textValues, roles) {
  const path = singleKey(PROJECT_PATHS, cards?.['proj-path'], 'proj-path');
  const { keys: types, other: typesOther } = splitMultiSelect(PROJECT_TYPES, chips?.['proj-types'], 'proj-types');
  const collabFormat = singleKey(COLLAB_FORMATS, cards?.['proj-location'], 'proj-location');
  const primaryGoal = singleKey(PROJECT_PRIMARY_GOALS, cards?.['proj-primary-goal'], 'proj-primary-goal');
  const { keys: industries, other: industriesOther } = splitMultiSelect(PROJECT_INDUSTRIES, chips?.['proj-industry'], 'proj-industry');
  const skills = dedupeTrimmed(chips?.['proj-skills'], MAX_SKILLS, 'proj-skills');

  const showBuilding = path === 'building' || path === 'either';
  const showJoining = path === 'joining' || path === 'either';

  let building = null;
  if (showBuilding) {
    const stage = singleKey(PROJECT_STAGES, cards?.['proj-stage'], 'proj-stage');
    let rawRoles = Array.isArray(roles) ? roles : [];
    if (rawRoles.length > MAX_ROLES) {
      console.warn(`[collabVocabulary] roles: ${rawRoles.length} entries exceed the ${MAX_ROLES} limit — trimming.`);
      rawRoles = rawRoles.slice(0, MAX_ROLES);
    }
    const normRoles = rawRoles
      .map(r => ({
        title: trimTitle(r?.title),
        slots: Math.max(1, Math.min(COLLAB_LIMITS.maxSlotsPerRole, Number(r?.slots) || 1)),
        skills: dedupeTrimmed(r?.skills, MAX_ROLE_SKILLS, 'role.skills'),
        experience: (r?.experience == null || r.experience === 'Any level')
          ? null
          : singleKey(EXPERIENCE_LEVELS, r.experience, 'role.experience'),
      }))
      .filter(r => r.title);
    const funding = singleKey(FUNDING, cards?.['proj-funding'], 'proj-funding');
    const { keys: offer } = splitMultiSelect(COMPENSATION, chips?.['proj-offer'], 'proj-offer');
    building = { stage, roles: normRoles, funding, offer };
  }

  let joining = null;
  if (showJoining) {
    const wantRoles = dedupeTrimmed(chips?.['proj-want-roles'], MAX_WANT_ROLES, 'proj-want-roles')
      .map(trimTitle);
    const experience = singleKey(EXPERIENCE_LEVELS, cards?.['proj-experience'], 'proj-experience');
    const { keys: wantsInReturn } = splitMultiSelect(COMPENSATION, chips?.['proj-return'], 'proj-return');
    const { keys: prefStageKeys } = splitMultiSelect(PROJECT_PREF_STAGES, chips?.['proj-pref-stage'], 'proj-pref-stage');
    const prefStages = prefStageKeys.includes('any') ? [] : prefStageKeys;
    joining = { wantRoles, experience, wantsInReturn, prefStages };
  }

  const workStyle = singleKey(WORK_STYLES, cards?.['proj-workstyle'], 'proj-workstyle');
  const commitment = singleKey(COMMITMENTS, cards?.['proj-time'], 'proj-time');
  const timeline = singleKey(PROJECT_TIMELINES, chips?.['proj-timeline']?.[0], 'proj-timeline');

  return {
    path, types, typesOther, collabFormat, primaryGoal, industries, industriesOther, skills,
    building, joining, workStyle, commitment, timeline,
  };
}

function normalizeProfessional(chips, cards, textValues) {
  const { keys: lookingFor, other: lookingForOther } = splitMultiSelect(PRO_LOOKING_FOR, chips?.['goals'], 'goals');
  const title = String(textValues?.['prof-title'] ?? '').trim().slice(0, MAX_TITLE_LEN);
  const org = String(textValues?.['prof-org'] ?? '').trim().slice(0, 120);
  const workSituation = singleKey(PRO_WORK_SITUATIONS, chips?.['prof-worksit']?.[0], 'prof-worksit');
  const careerStage = singleKey(CAREER_STAGES, cards?.['stage'], 'stage');
  const { keys: industries, other: industriesOther } = splitMultiSelect(PRO_INDUSTRIES, chips?.['industry'], 'industry');
  const skills = dedupeTrimmed(chips?.['prof-skills'], MAX_SKILLS, 'prof-skills');
  const primaryGoal = singleKey(PRO_PRIMARY_GOALS, cards?.['prof-primary-goal'], 'prof-primary-goal');
  const mentorship = singleKey(MENTORSHIP_PREFS, cards?.['prof-mentor'], 'prof-mentor');
  const industryScope = singleKey(INDUSTRY_SCOPES, cards?.['prof-indpref'], 'prof-indpref');
  const networkStyle = singleKey(PRO_NETWORK_STYLES, cards?.['network'], 'network');

  return {
    lookingFor, lookingForOther, title, org, workSituation, careerStage, industries,
    industriesOther, skills, primaryGoal, mentorship, industryScope, networkStyle,
  };
}

// Turns CategoryDeepDivePage's stored answers (display strings — chips/cards/
// textValues/roles) into stable keys plus free text. Returns null for any
// category other than 'project' / 'professional'. Never throws: unknown
// values are dropped (single-select) or bucketed into "…Other" (multi-select
// customizable fields) with a console.warn, same limits the UI itself enforces.
export function normalizeDeepDive(category, { chips, cards, textValues, roles } = {}) {
  if (category === 'project') return normalizeProject(chips, cards, textValues, roles);
  if (category === 'professional') return normalizeProfessional(chips, cards, textValues);
  return null;
}
