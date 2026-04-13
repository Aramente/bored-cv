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
    summary: str = ""
    experiences: list[Experience] = []
    education: list[Education] = []
    skills: list[str] = []


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


class ChatResponse(BaseModel):
    message: str
    is_complete: bool = False


class RewrittenExperience(BaseModel):
    title: str
    company: str
    dates: str
    bullets: list[str]


class CVData(BaseModel):
    name: str
    title: str
    email: str = ""
    location: str = ""
    summary: str
    experiences: list[RewrittenExperience]
    education: list[Education]
    skills: list[str]
    language: str = "en"


class GenerateRequest(BaseModel):
    profile: Profile
    offer: Offer
    gap_analysis: GapAnalysis
    messages: list[ChatMessage]


class OfferScrapeRequest(BaseModel):
    url: str = ""
    raw_text: str = ""


class AnalyzeRequest(BaseModel):
    profile: Profile
    offer: Offer
