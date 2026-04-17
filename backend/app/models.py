from pydantic import BaseModel, Field


class Experience(BaseModel):
    title: str
    company: str
    dates: str
    description: str
    bullets: list[str] = []


class Education(BaseModel):
    degree: str
    school: str
    year: str


class Profile(BaseModel):
    name: str
    title: str
    location: str = ""
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    summary: str = ""
    experiences: list[Experience] = []
    education: list[Education] = []
    skills: list[str] = []
    languages: list[str] = []


class OfferRequirement(BaseModel):
    text: str
    category: str = ""


class Offer(BaseModel):
    title: str
    company: str
    location: str = ""
    description: str
    requirements: list[OfferRequirement] = []
    nice_to_have: list[OfferRequirement] = []


class GapAnalysis(BaseModel):
    matched_skills: list[str] = []
    gaps: list[str] = []
    questions: list[str] = []


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    profile: Profile
    offer: Offer
    gap_analysis: GapAnalysis
    messages: list[ChatMessage] = []
    ui_language: str = "en"
    known_facts: list[str] = []
    contradictions: list[str] = []
    cv_draft: "CVData | None" = None


class CvAction(BaseModel):
    action: str  # "remove_experience", "add_bullet", "reorder", "edit_field", "merge_experiences"
    target: str = ""  # company name, field path, etc.
    value: str | dict | list = ""  # new value for edits/adds; merge_experiences uses dict
    index: int = -1  # for positional operations


class ChatResponse(BaseModel):
    message: str
    is_complete: bool = False
    cv_actions: list[CvAction] = []
    progress: int = 0  # 0-100, percentage of key points covered


class RewrittenExperience(BaseModel):
    title: str
    company: str
    dates: str
    bullets: list[str]


class CVData(BaseModel):
    name: str
    title: str
    email: str = ""
    phone: str = ""
    linkedin: str = ""
    location: str = ""
    summary: str
    experiences: list[RewrittenExperience]
    education: list[Education]
    skills: list[str]
    languages: list[str] = []
    language: str = "en"
    match_score: int = 0
    strengths: list[str] = []
    improvements: list[str] = []


class GenerateRequest(BaseModel):
    profile: Profile
    offer: Offer
    gap_analysis: GapAnalysis
    messages: list[ChatMessage]
    ui_language: str = "en"
    tone: str = "startup"  # startup, corporate, creative, minimal
    target_market: str = "france"  # france, europe, us, global


class OfferScrapeRequest(BaseModel):
    url: str = ""
    raw_text: str = ""


class AnalyzeRequest(BaseModel):
    profile: Profile
    offer: Offer
    ui_language: str = "en"


class ProjectSummary(BaseModel):
    id: int
    name: str
    offer_title: str
    match_score: int
    template: str
    tone: str
    created_at: str
    updated_at: str


class ProjectDetail(BaseModel):
    id: int
    name: str
    offer_title: str
    offer_url: str
    offer_data: Offer | None = None
    profile_data: Profile | None = None
    gap_analysis: GapAnalysis | None = None
    cv_data: CVData | None = None
    messages: list[ChatMessage] = []
    match_score: int = 0
    template: str = "clean"
    tone: str = "startup"
    created_at: str = ""
    updated_at: str = ""


class CoverLetterData(BaseModel):
    greeting: str = ""
    opening: str = ""  # hook paragraph
    body: str = ""     # 2-3 paragraphs linking experience to role
    closing: str = ""  # call to action
    signature: str = ""
    language: str = "en"


class CoverLetterRequest(BaseModel):
    profile: Profile
    offer: Offer
    cv_data: CVData
    messages: list[ChatMessage] = []
    ui_language: str = "en"
    tone: str = "startup"
    target_market: str = "france"


class KnowledgeEntry(BaseModel):
    id: int = 0
    company: str
    company_context: str = ""
    title: str
    dates: str = ""
    description: str = ""
    facts: dict = {}
    best_bullets: list[str] = []


class FactEntry(BaseModel):
    id: int = 0
    knowledge_id: int = 0
    key: str
    value: str
    source_project_id: int = 0


class KnowledgeBase(BaseModel):
    experiences: list[KnowledgeEntry] = []
    facts: list[FactEntry] = []
    contradictions: list[str] = []
