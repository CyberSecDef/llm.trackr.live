<?php

namespace App\Services\Llm\Exceptions;

use RuntimeException;

/**
 * Base for all vendor-client failures. Concrete subclasses below
 * communicate the user-actionable category so the run-submission
 * pipeline can pick the right response.
 */
class LlmClientException extends RuntimeException {}
