"""Shared helper for Groq JSON-mode chat completions with automatic retry.

Groq's JSON mode occasionally produces invalid JSON despite explicit prompt
instructions — e.g. writing a timestamp field as the expression "1.45 * 60"
instead of the literal number 87, which fails Groq's own JSON validation
before the response ever reaches us. Retrying the same request usually
succeeds since LLM sampling is stochastic.
"""
import logging
from openai import BadRequestError

logger = logging.getLogger(__name__)


def call_groq_json(client, *, model, system, user, temperature, retries=2):
    """Call Groq's JSON-mode chat completion, retrying on invalid-JSON errors.

    Returns the raw JSON string from the response (callers do their own
    json.loads + shape handling, since that varies per caller).
    """
    last_error = None
    for attempt in range(retries):
        try:
            response = client.chat.completions.create(
                model=model,
                response_format={"type": "json_object"},
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            return response.choices[0].message.content
        except BadRequestError as e:
            last_error = e
            logger.warning("Groq returned invalid JSON on attempt %d/%d: %s", attempt + 1, retries, e)
    raise last_error
