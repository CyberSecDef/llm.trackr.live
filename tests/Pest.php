<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind a different classes or traits.
|
*/

pest()->extend(TestCase::class)->in('Feature');

// M13 chunk 1 follow-up: every Feature test gets the
// RefreshDatabase trait automatically. Was a latent gap after the
// M12-followup phpunit.xml switch to `DB_DATABASE=:memory:` — tests
// that didn't already opt in (AboutPage, WelcomePage, ErrorPages,
// dev:login routes, etc.) hit a no-such-table error when their
// controller stack queried e.g. registry_meta. Applying it globally
// is cheap (:memory: migrations finish in ~50 ms per test) and
// guarantees a clean per-test DB.
pest()->use(RefreshDatabase::class)->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions.
| The "expect()" function gives you access to a set of "expectations" methods that you
| can use to assert different things. Of course, you may extend the Expectation API at
| any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

function something(): void
{
    // ..
}
