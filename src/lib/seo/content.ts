export type PublicContentLink = {
  label: string;
  href: string;
};

export type PublicArticle = {
  slug: string;
  title: string;
  description: string;
  summary: string;
  category: string;
  author: string;
  publishedAt: string;
  updatedAt: string;
  takeaways: string[];
  sections: Array<{ heading: string; body: string }>;
  relatedLinks: PublicContentLink[];
  image?: string | null;
};

export const BLOG_ARTICLES: PublicArticle[] = [
  {
    slug: "build-a-repeatable-content-system",
    title: "How to Build a Repeatable Content System",
    description: "A practical guide to turning one business idea into useful content, a publishing plan, and measurable next actions.",
    summary: "A repeatable content system starts with one clear audience problem, turns it into a small set of useful assets, and gives each asset a deliberate place in the publishing calendar.",
    category: "Content systems",
    author: "Soma Digital Community",
    publishedAt: "2026-07-28",
    updatedAt: "2026-07-28",
    takeaways: [
      "Begin with the audience problem rather than the format.",
      "Create a small content family from one strong idea.",
      "Use a calendar and review loop so publishing becomes a habit.",
    ],
    sections: [
      {
        heading: "Start with the audience",
        body: "The strongest content systems are anchored to a real question, obstacle, or desired outcome. Write down who the content is for, what they are trying to do, and what a useful next step looks like. This context keeps AI-assisted drafts specific and gives every asset a reason to exist.",
      },
      {
        heading: "Create a content family",
        body: "One idea can become a short social post, a longer explanation, an email, a visual, and a video outline. The point is not to repeat the same words everywhere. Adapt the idea to each channel while preserving the core lesson and call to action.",
      },
      {
        heading: "Publish, learn, and improve",
        body: "A content system becomes useful when it includes a publishing rhythm and a review step. Schedule the assets, watch the response, and record what should change next time. SDC brings creation, planning, publishing, and learning into one operating system.",
      },
    ],
    relatedLinks: [
      { label: "Explore AI Studio", href: "/ai/studio" },
      { label: "Learn in Academy", href: "/academy" },
      { label: "See membership plans", href: "/pricing" },
    ],
  },
  {
    slug: "what-an-ai-operating-system-means-for-a-business",
    title: "What an AI Operating System Means for a Business",
    description: "Understand the difference between isolated AI tools and one connected workspace for creating, planning, learning, and publishing.",
    summary: "An AI operating system connects the context, assets, decisions, and workflows that a growing digital business uses every week.",
    category: "AI for business",
    author: "Soma Digital Community",
    publishedAt: "2026-07-28",
    updatedAt: "2026-07-28",
    takeaways: [
      "Context is more valuable when it can travel between workflows.",
      "A business roadmap should lead to practical actions.",
      "Human review remains part of a responsible AI workflow.",
    ],
    sections: [
      {
        heading: "Move beyond isolated prompts",
        body: "A single prompt can produce a useful answer, but a business needs continuity. Goals, audience details, brand preferences, generated assets, and publishing plans should be available when the next task begins. That reduces repeated setup and makes the output easier to act on.",
      },
      {
        heading: "Connect strategy to execution",
        body: "A roadmap is only valuable when it becomes a sequence of manageable actions. The operating-system approach connects business planning with creation tools, Academy learning, and the Scheduler so a user can move from an idea to a published asset with less friction.",
      },
      {
        heading: "Keep people in control",
        body: "AI should accelerate drafting and decision support, not remove judgment. Users should see what will be created, understand any usage cost, review the result, and choose when to publish. That is the standard SDC aims to make ordinary for digital entrepreneurs.",
      },
    ],
    relatedLinks: [
      { label: "Meet AI Mentor", href: "/mentor" },
      { label: "Open the public Academy", href: "/academy" },
      { label: "Explore the SDC ecosystem", href: "/" },
    ],
  },
];

export const CASE_STUDIES: PublicArticle[] = [
  {
    slug: "from-one-idea-to-a-scheduled-campaign",
    title: "From One Idea to a Scheduled Campaign",
    description: "A workflow example showing how SDC connects business context, content creation, visual assets, and publishing.",
    summary: "This product workflow example follows one business idea through planning, asset creation, review, and scheduling inside SDC. It is an illustrative process, not a claim about a specific customer result.",
    category: "Workflow example",
    author: "Soma Digital Community",
    publishedAt: "2026-07-28",
    updatedAt: "2026-07-28",
    takeaways: [
      "A clear audience and goal make every downstream step easier.",
      "One approved message can power several content formats.",
      "Preview and platform settings should be checked before scheduling.",
    ],
    sections: [
      {
        heading: "The starting point",
        body: "The workflow begins with a simple business idea and two decisions: who the message is for and what the audience should do next. These details become the shared context for the draft, image, voice, video, and campaign steps.",
      },
      {
        heading: "The production pass",
        body: "The creator turns the idea into a primary message, then adapts it into the formats the campaign needs. Each result can be reviewed and refined before it is saved. This keeps the work coherent without forcing every platform to use identical copy.",
      },
      {
        heading: "The publishing pass",
        body: "Before scheduling, the creator chooses the connected account, checks the final caption and media, confirms disclosure or promotion settings where required, and reviews the exact publish preview. The Scheduler then receives a platform-ready package.",
      },
    ],
    relatedLinks: [
      { label: "Explore Scheduler", href: "/social/calendar" },
      { label: "Create with AI Studio", href: "/ai/studio" },
      { label: "See Creator Credits", href: "/pricing#credits" },
    ],
  },
  {
    slug: "a-practical-learning-loop-for-digital-entrepreneurs",
    title: "A Practical Learning Loop for Digital Entrepreneurs",
    description: "A workflow example for combining Academy lessons, class activities, feedback, and real business action.",
    summary: "The most useful learning loop connects a lesson to a written response, a reviewable activity, and one practical action that can be applied to a real business.",
    category: "Learning workflow",
    author: "Soma Digital Community",
    publishedAt: "2026-07-28",
    updatedAt: "2026-07-28",
    takeaways: [
      "Learning should end in an action, not only a completion mark.",
      "Activities can use the response type that matches the question.",
      "Manual review gives educators a clear place to provide feedback.",
    ],
    sections: [
      {
        heading: "Learn in context",
        body: "A learner starts with a focused lesson and uses the material to answer questions about their own business or goals. This makes the activity useful even when the learner is still exploring an idea.",
      },
      {
        heading: "Respond in the right format",
        body: "Some questions need a yes or no response, while others need a paragraph, a choice, a checklist, or a file. Matching the field to the question makes the activity clearer and creates better evidence of understanding.",
      },
      {
        heading: "Turn learning into momentum",
        body: "Once the activity is complete or reviewed, the learner can apply the lesson to a roadmap, campaign, or piece of content. The result is a loop between learning and doing rather than a disconnected course checklist.",
      },
    ],
    relatedLinks: [
      { label: "Browse Academy", href: "/academy" },
      { label: "Understand SDC plans", href: "/pricing" },
      { label: "Get support", href: "/support" },
    ],
  },
];

export function getBlogArticle(slug: string) {
  return BLOG_ARTICLES.find((article) => article.slug === slug);
}

export function getCaseStudy(slug: string) {
  return CASE_STUDIES.find((article) => article.slug === slug);
}
