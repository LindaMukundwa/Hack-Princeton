/*
    RIGHT                                        LEFT
    _______                                     _______
---'   ____)____    left2         right2   ____(____   '---             ^
          ______)   left1         right1  (______                       |
          _______)  middle        middle (_______                       y <---x--->
         _______)   right1        left1   (_______                      |
---.__________)     right2        left2    (__________.---              v

*/

function rangeCheck(notesState, min, max) {
    min = min < 0 ? 0 : min;
    max = max > 87 ? 87 : max;
    while (min <= max) {
        if (notesState[min])
            return true;
        min++;
    }
    return false
}

function animateFingers(notesState, rigHelper, mixamorig, track, animate) {
    // Skip animation if teacher mode is active so the teacher mode handles its own animations
    if (window.settings && window.settings["Enable Teacher Mode"]) {
        return;
    }

    let helper = track == 0 ? rigHelper.right : rigHelper.left;
    let average = helper.average;
    let modificator = track == 0 ? 1 : -1;
    let hand = {
        left2: track == 0 ? mixamorig.mixamorigHandThumb[track] : mixamorig.mixamorigHandPinky[track],
        left1: track == 0 ? mixamorig.mixamorigHandIndex[track] : mixamorig.mixamorigHandRing[track],
        middle: mixamorig.mixamorigHandMiddle[track],
        right1: track == 0 ? mixamorig.mixamorigHandRing[track] : mixamorig.mixamorigHandIndex[track],
        right2: track == 0 ? mixamorig.mixamorigHandPinky[track] : mixamorig.mixamorigHandThumb[track]
    }

    mixamorig.mixamorigHandThumb[track].rotation.set(0, 0, -0.4 * modificator);
    mixamorig.mixamorigHandIndex[track].rotation.set(0, 0, 0);
    mixamorig.mixamorigHandMiddle[track].rotation.set(0, 0, 0);
    mixamorig.mixamorigHandRing[track].rotation.set(0, 0, 0);
    mixamorig.mixamorigHandPinky[track].rotation.set(0, 0, 0);

    if (!animate)
        return; //reset fingers position and return

    if (rangeCheck(notesState[track], average - 1, average + 1)) {
        hand.middle.rotation.z = 0.3 * modificator;
    }
    if (rangeCheck(notesState[track], average - 2, average - 2)) {
        hand.left1.rotation.z = 0.3 * modificator;
    }
    if (rangeCheck(notesState[track], average - 5, average - 3)) {
        if (track) {
            hand.left2.rotation.z += 0.1 * modificator;
            hand.left2.rotation.y = -0.5 * modificator;
        }
        else {
            hand.right2.rotation.x = 0.5 * modificator;
        }
    }
    if (rangeCheck(notesState[track], average - 8, average - 5)) {
        if (track) {
            hand.left2.rotation.z += 0.1 * modificator;
            hand.left2.rotation.y = -0.8 * modificator;
        }
        else {
            hand.left2.rotation.x = 0.5 * modificator;
        }
    }
    if (rangeCheck(notesState[track], average + 2, average + 2)) {
        hand.right1.rotation.z = 0.3 * modificator;
    }
    if (rangeCheck(notesState[track], average + 3, average + 5)) {
        if (!track) {
            hand.right2.rotation.z += 0.1 * modificator;
            hand.right2.rotation.y = -0.5 * modificator;
        }
        else {
            hand.right2.rotation.x = 0.5 * modificator;
        }
    }
    if (rangeCheck(notesState[track], average + 5, average + 8)) {
        if (!track) {
            hand.right2.rotation.z += 0.1 * modificator;
            hand.right2.rotation.y = -0.8 * modificator;
        }
        else {
            hand.right2.rotation.x = 0.5 * modificator;
        }
    }
}


export { animateFingers };
