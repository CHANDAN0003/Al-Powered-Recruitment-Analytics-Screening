from typing import List
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Simple TF-IDF based matcher. For production, replace / augment with embeddings.

class ResumeMatcher:
    def __init__(self):
        self.vectorizer = TfidfVectorizer(stop_words='english', max_features=5000)

    def score(self, job_description: str, resumes: List[str]) -> List[float]:
        if not resumes:
            return []
        corpus = [job_description] + resumes
        tfidf = self.vectorizer.fit_transform(corpus)
        job_vec = tfidf[0]
        scores = []
        for i in range(1, len(corpus)):
            sim = cosine_similarity(job_vec, tfidf[i])
            # similarity returns array [[value]]
            value = float(sim[0][0])
            scores.append(round(value * 100, 2))
        return scores

matcher = ResumeMatcher()
