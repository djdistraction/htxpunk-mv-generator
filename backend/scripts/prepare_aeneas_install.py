"""
Prepares the environment for installing aeneas (backend/requirements-aeneas.txt).

aeneas 1.7.3.0's setup.py imports `numpy.distutils.misc_util` unconditionally
to compute include dirs for its C extensions (cdtw, cmfcc, cwave — separate
from the `cew` extension AENEAS_WITH_CEW=False skips). NumPy removed
`numpy.distutils` entirely on Python >= 3.12 — confirmed directly, not
assumed: no numpy version restores it there, per NumPy's own migration
notes (https://numpy.org/devdocs/reference/distutils_status_migration.html).
Without this, pip install fails with "You must install numpy before
installing aeneas" even though numpy is installed — that error message is
aeneas's setup.py mis-reporting an ImportError on numpy.distutils itself.

The only thing aeneas actually calls from that module is
get_numpy_include_dirs(), a one-liner equivalent to `[numpy.get_include()]`
(confirmed by reading aeneas's own setup.py/cXXX_setup.py source — nothing
else from numpy.distutils is used). On affected Pythons, this writes a
minimal shim module into the installed numpy package satisfying that one
import, without reviving any other legacy distutils behavior. Real
numpy.distutils (present and working on Python < 3.12) is left untouched.

Run with the *same* Python that will install requirements-aeneas.txt, after
requirements.txt has installed numpy, before requirements-aeneas.txt:

    pip install -r requirements.txt
    python scripts/prepare_aeneas_install.py
    pip install --no-build-isolation -r requirements-aeneas.txt

(AENEAS_WITH_CEW=False env var is still required for that last step, to
skip the cew extension — this script doesn't replace that.)
"""
import os
import textwrap


def main():
    try:
        from numpy.distutils import misc_util
        misc_util.get_numpy_include_dirs
        print("[prepare_aeneas_install] numpy.distutils already available — nothing to do.")
        return
    except ImportError:
        pass

    import numpy

    distutils_dir = os.path.join(os.path.dirname(numpy.__file__), "distutils")
    os.makedirs(distutils_dir, exist_ok=True)

    init_path = os.path.join(distutils_dir, "__init__.py")
    if not os.path.exists(init_path):
        open(init_path, "w").close()

    misc_util_path = os.path.join(distutils_dir, "misc_util.py")
    if not os.path.exists(misc_util_path):
        with open(misc_util_path, "w") as f:
            f.write(textwrap.dedent('''\
                # Minimal shim: numpy.distutils was removed on Python >= 3.12.
                # aeneas's setup.py only needs this one function — see
                # backend/scripts/prepare_aeneas_install.py for why this exists.
                import numpy as _numpy


                def get_numpy_include_dirs():
                    return [_numpy.get_include()]
            '''))

    print(f"[prepare_aeneas_install] Wrote numpy.distutils shim to {distutils_dir}")


if __name__ == "__main__":
    main()
