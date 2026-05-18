<?php

namespace App\Enums;

enum PositionEncoding: string
{
    case Rope = 'rope';
    case Alibi = 'alibi';
    case Learned = 'learned';
}
