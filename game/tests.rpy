## tests.rpy
##
## Ren'Py test cases. Run them from the Ren'Py launcher folder with
##   ./renpy.sh /path/to/storyboard-vn test meridian_restored
## They click through the real screens, so they exercise the main menu, the choice
## screen, the ending flags and the ending gallery in desktop Ren'Py.

testsuite global:
    teardown:
        exit

testcase meridian_restored:
    $ _test.transition_timeout = 0.05
    click "New Expedition"
    advance until screen "choice"
    click "Offer to help her log the morning tide."
    advance until screen "choice"
    click "Ask for the vault key."
    advance until screen "choice"
    click "Thank him and head down to the workshop."
    advance until screen "choice"
    click "Hold the prism steady while Soren cuts the seat."
    advance until screen "choice"
    click "Lend Mira your hands at the harbor lamp."
    advance until screen "choice"
    click "Calibrate by the book, one prism at a time."
    advance until screen "main_menu"
    click "Ending Gallery"
    assert eval (persistent.ending_meridian_restored)
    click "Return"

testcase glass_fracture:
    $ _test.transition_timeout = 0.05
    click "New Expedition"
    advance until screen "choice"
    click "Offer to help her log the morning tide."
    advance until screen "choice"
    click "Thank him and head down to the workshop."
    advance until screen "choice"
    click "Hold the prism steady while Soren cuts the seat."
    advance until screen "choice"
    click "Force the vault with Soren's tools."
    advance until screen "choice"
    click "Calibrate quickly, because the storm window is closing."
    advance until screen "main_menu"
    assert eval (persistent.ending_glass_fracture)

testcase silent_observatory:
    $ _test.transition_timeout = 0.05
    click "New Expedition"
    advance until screen "choice"
    click "Offer to help her log the morning tide."
    advance until screen "choice"
    click "Thank him and head down to the workshop."
    advance until screen "choice"
    click "Hold the prism steady while Soren cuts the seat."
    advance until screen "choice"
    click "Lend Mira your hands at the harbor lamp."
    advance until screen "choice"
    click "Leave the lens dark, and give the key back."
    advance until screen "main_menu"
    assert eval (persistent.ending_silent_observatory)

testcase probe:
    pause 1.0
    assert screen "main_menu"
    click "Ending Gallery"
    pause 1.0
    click "Return"
    pause 0.5
