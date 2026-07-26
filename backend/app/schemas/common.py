"""Shared model configuration.

Every schema in this package inherits from :class:`CamelModel`, which emits
camelCase JSON while keeping snake_case attribute names in Python.

This is a deliberate deviation from the snake_case payloads shown in PRD 16.3:
the frontend contract in ``frontend/types/analysis.ts`` is camelCase, and having
the serialiser handle the conversion means one naming convention holds end to
end with no hand-written mapping layer to drift out of sync.
"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model serialising to camelCase but constructible from either form."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        # Reject unknown keys rather than silently dropping them, so a typo in
        # an uploaded config surfaces as a validation error.
        extra="forbid",
    )
