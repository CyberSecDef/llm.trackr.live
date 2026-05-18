<?php

namespace App\Services\Threads\Exceptions;

use RuntimeException;

/**
 * Base for all RunService::submit() failures. Subclasses carry the
 * specific failure category so the HTTP layer (M6) can map to the
 * right status code.
 */
class RunSubmissionException extends RuntimeException {}
