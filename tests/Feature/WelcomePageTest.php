<?php

it('serves the inertia welcome page', function () {
    $response = $this->get('/');

    $response->assertStatus(200);
    $response->assertSee('data-page', escape: false);
});

it('passes laravel and php versions as inertia props', function () {
    $response = $this->get('/');

    $response->assertStatus(200);
    $response->assertSee('"component":"Welcome"', escape: false);
    $response->assertSee('"laravelVersion":', escape: false);
    $response->assertSee('"phpVersion":', escape: false);
});
